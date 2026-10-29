import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractVersion } from '../../integrations/contracts/contract-version.enum.js';
import {
  ComplaintCategory as MadCategory,
  ComplaintSeverity as MadSeverity,
} from '../../integrations/internal-services/mad/dto/mad-complaint.dto.js';
import {
  MAD_COMPLAINT_PROVIDER,
  MadComplaintProvider,
} from '../../integrations/internal-services/mad/interfaces/mad-complaint-provider.interface.js';
import { RealtimeEventType } from '../../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { FossDemoOrderRepository } from '../food-orders/repositories/foss-demo-order.repository.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { FossServiceRequestRepository } from '../service-requests/repositories/foss-service-request.repository.js';
import { AdvanceComplaintStatusDto } from './dto/advance-complaint-status.dto.js';
import {
  ComplaintResponseDto,
  ComplaintTimelineStepDto,
} from './dto/complaint-response.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { GetComplaintsQueryDto } from './dto/get-complaints-query.dto.js';
import { MadComplaintStatusUpdatedEventDto } from './dto/mad-status-event.dto.js';
import { FossComplaint } from './entities/foss-complaint.entity.js';
import { ComplaintStatus } from './enums/complaint-status.enum.js';
import { FossComplaintRepository } from './repositories/foss-complaint.repository.js';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);
  private readonly seenMadEventIds = new Set<string>();
  private readonly maxSeenEvents = 1000;

  constructor(
    private readonly complaintRepository: FossComplaintRepository,
    @Inject(MAD_COMPLAINT_PROVIDER)
    private readonly madProvider: MadComplaintProvider,
    private readonly orderRepository: FossDemoOrderRepository,
    private readonly serviceRequestRepository: FossServiceRequestRepository,
    private readonly configService: ConfigService,
    @Optional()
    private readonly realtimeService?: RealtimeService,
  ) {}

  /**
   * Submits a guest complaint, validating room/booking ownership and any referenced orders/requests,
   * redacting sensitive credentials, persisting to Neon, forwarding to MAD, and broadcasting status.
   */
  public async fileComplaint(
    guest: GuestContext,
    dto: CreateComplaintDto,
    idempotencyHeader?: string,
  ): Promise<ComplaintResponseDto> {
    const idempotencyKey =
      idempotencyHeader?.trim() || dto.idempotencyKey?.trim() || randomUUID();

    // 1. Idempotency replay check
    const existing =
      await this.complaintRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      this.logger.log(
        `Idempotent complaint replay: returning existing complaint [${existing.complaintId}] for room [${guest.roomNumber}].`,
      );
      return this.mapToResponse(existing);
    }

    // 2. Cross-room ownership validation for referenced food orders
    if (dto.relatedOrderId) {
      const order = await this.orderRepository.findById(dto.relatedOrderId);
      if (
        !order ||
        order.bookingId !== guest.bookingId ||
        order.roomNumber !== guest.roomNumber
      ) {
        throw new BadRequestException(
          `Referenced food order [${dto.relatedOrderId}] does not belong to the current guest stay.`,
        );
      }
    }

    // 3. Cross-room ownership validation for referenced service requests
    if (dto.relatedRequestId) {
      const request = await this.serviceRequestRepository.findById(
        dto.relatedRequestId,
      );
      if (
        !request ||
        request.bookingId !== guest.bookingId ||
        request.roomNumber !== guest.roomNumber
      ) {
        throw new BadRequestException(
          `Referenced service request [${dto.relatedRequestId}] does not belong to the current guest stay.`,
        );
      }
    }

    // 4. Input sanitization and PII/PAN redaction
    const sanitizedSubject = this.sanitizeInput(dto.subject);
    const sanitizedDescription = this.sanitizeInput(dto.description);

    // 5. Generate human-readable collision-free complaint reference (e.g. CMP-20261029-A1B2C3)
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = randomBytes(3).toString('hex').toUpperCase();
    const complaintId = `CMP-${datePart}-${randomSuffix}`;

    const complaint = new FossComplaint();
    complaint.complaintId = complaintId;
    complaint.bookingId = guest.bookingId;
    complaint.roomNumber = guest.roomNumber;
    complaint.category = dto.category;
    complaint.severity = dto.severity;
    complaint.subject = sanitizedSubject;
    complaint.description = sanitizedDescription;
    complaint.status = ComplaintStatus.SUBMITTED;
    complaint.relatedOrderId = dto.relatedOrderId ?? null;
    complaint.relatedRequestId = dto.relatedRequestId ?? null;
    complaint.assignedManager = null;
    complaint.resolutionNotes = null;
    complaint.idempotencyKey = idempotencyKey;

    // 6. Durable MAD Forwarding (survives upstream outage without data loss)
    try {
      const madResult = await this.madProvider.fileComplaint({
        complaintId,
        bookingId: guest.bookingId,
        roomNumber: guest.roomNumber,
        category: dto.category as unknown as MadCategory,
        severity: dto.severity as unknown as MadSeverity,
        subject: sanitizedSubject,
        description: sanitizedDescription,
        relatedOrderId: dto.relatedOrderId,
        relatedTaskId: dto.relatedRequestId,
        idempotencyKey,
        version: ContractVersion.V1_0,
      });

      if (madResult) {
        if (madResult.assignedManager) {
          complaint.assignedManager = madResult.assignedManager;
        }
        if (madResult.status) {
          complaint.status = madResult.status;
        }
      }
    } catch (err) {
      this.logger.warn(
        `MAD upstream provider degraded or unreachable for complaint [${complaintId}]: ${
          err instanceof Error ? err.message : String(err)
        }. Complaint is preserved in FOSS Neon persistence.`,
      );
    }

    // 7. Persist to Neon storage
    await this.complaintRepository.save(complaint);

    // 8. Real-time stay broadcast
    const response = this.mapToResponse(complaint);
    this.realtimeService?.emitToStay(
      guest.bookingId,
      guest.roomNumber,
      RealtimeEventType.COMPLAINT_STATUS_UPDATED,
      response,
    );

    return response;
  }

  /**
   * Retrieves a complaint by ID for the current authenticated guest stay.
   */
  public async getComplaintById(
    guest: GuestContext,
    complaintId: string,
  ): Promise<ComplaintResponseDto> {
    const complaint = await this.complaintRepository.findById(complaintId);
    if (
      !complaint ||
      complaint.bookingId !== guest.bookingId ||
      complaint.roomNumber !== guest.roomNumber
    ) {
      throw new NotFoundException(
        `Complaint [${complaintId}] not found for the current guest stay.`,
      );
    }
    return this.mapToResponse(complaint);
  }

  /**
   * Retrieves all complaints filed during the current authenticated guest stay with optional filters.
   */
  public async getComplaints(
    guest: GuestContext,
    query?: GetComplaintsQueryDto,
  ): Promise<ComplaintResponseDto[]> {
    const complaints = await this.complaintRepository.findByBookingAndRoom(
      guest.bookingId,
      guest.roomNumber,
      query,
    );
    return complaints.map((c) => this.mapToResponse(c));
  }

  /**
   * Advances complaint status for simulation or manager action (Demo/Testing).
   */
  public async advanceComplaintStatus(
    guest: GuestContext,
    complaintId: string,
    dto: AdvanceComplaintStatusDto,
  ): Promise<ComplaintResponseDto> {
    const complaint = await this.complaintRepository.findById(complaintId);
    if (
      !complaint ||
      complaint.bookingId !== guest.bookingId ||
      complaint.roomNumber !== guest.roomNumber
    ) {
      throw new NotFoundException(
        `Complaint [${complaintId}] not found for the current guest stay.`,
      );
    }

    // Forward progression check: cannot regress RESOLVED complaint to SUBMITTED
    if (
      complaint.status === ComplaintStatus.RESOLVED &&
      dto.status === ComplaintStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Cannot regress a resolved complaint to SUBMITTED.',
      );
    }

    complaint.status = dto.status;
    if (dto.assignedManager !== undefined) {
      complaint.assignedManager = dto.assignedManager;
    }
    if (dto.resolutionNotes !== undefined) {
      complaint.resolutionNotes = dto.resolutionNotes;
    }
    complaint.updatedAt = new Date();

    await this.complaintRepository.save(complaint);

    const response = this.mapToResponse(complaint);
    this.realtimeService?.emitToStay(
      guest.bookingId,
      guest.roomNumber,
      RealtimeEventType.COMPLAINT_STATUS_UPDATED,
      response,
    );

    return response;
  }

  /**
   * Ingests and processes asynchronous status update events from the authoritative MAD subsystem.
   */
  public async handleMadStatusEvent(
    event: MadComplaintStatusUpdatedEventDto,
  ): Promise<{
    processed: boolean;
    message: string;
    duplicate?: boolean;
    complaint?: ComplaintResponseDto;
  }> {
    // 1. Idempotency & deduplication check
    if (this.seenMadEventIds.has(event.eventId)) {
      this.logger.log(
        `Duplicate MAD event [${event.eventId}] discarded: event already processed.`,
      );
      return {
        processed: true,
        duplicate: true,
        message: 'Duplicate event discarded.',
      };
    }

    // 2. Fetch correlated complaint
    const complaint = await this.complaintRepository.findById(
      event.complaintId,
    );
    if (!complaint) {
      this.logger.warn(
        `MAD event [${event.eventId}] rejected: Complaint [${event.complaintId}] not found.`,
      );
      throw new NotFoundException(
        `Complaint [${event.complaintId}] not found for MAD status update.`,
      );
    }

    // 3. Security check: room mismatch
    if (complaint.roomNumber !== event.roomNumber) {
      this.logger.warn(
        `MAD event [${event.eventId}] forbidden: room mismatch (event room [${event.roomNumber}] vs complaint room [${complaint.roomNumber}]).`,
      );
      throw new ForbiddenException(
        'Event room number does not match complaint room.',
      );
    }

    // 4. Stale event check
    const eventOccurredAt = new Date(event.occurredAt);
    if (
      eventOccurredAt < complaint.updatedAt &&
      complaint.status === ComplaintStatus.RESOLVED
    ) {
      this.logger.warn(
        `Stale MAD event [${event.eventId}] discarded: event occurredAt [${event.occurredAt}] is older than current complaint updatedAt [${complaint.updatedAt.toISOString()}].`,
      );
      return {
        processed: false,
        message: 'Stale MAD event discarded.',
      };
    }

    // 5. Out-of-order check: cannot regress from RESOLVED to SUBMITTED
    if (
      complaint.status === ComplaintStatus.RESOLVED &&
      event.status === ComplaintStatus.SUBMITTED
    ) {
      this.logger.warn(
        `Out-of-order MAD event [${event.eventId}] discarded: cannot regress status from [RESOLVED] to [SUBMITTED].`,
      );
      return {
        processed: false,
        message: 'Out-of-order MAD event discarded.',
      };
    }

    // 6. Apply state transition
    complaint.status = event.status;
    if (event.assignedManager !== undefined) {
      complaint.assignedManager = event.assignedManager;
    }
    if (event.resolutionNotes !== undefined) {
      complaint.resolutionNotes = event.resolutionNotes;
    }
    complaint.updatedAt = new Date(event.occurredAt);

    await this.complaintRepository.save(complaint);

    // Record processed event ID
    if (this.seenMadEventIds.size >= this.maxSeenEvents) {
      const firstEntry = this.seenMadEventIds.values().next().value;
      if (firstEntry) this.seenMadEventIds.delete(firstEntry);
    }
    this.seenMadEventIds.add(event.eventId);

    this.logger.log(
      `MAD event [${event.eventId}] applied: complaint [${complaint.complaintId}] status transitioned to [${complaint.status}].`,
    );

    const response = this.mapToResponse(complaint);
    this.realtimeService?.emitToStay(
      complaint.bookingId,
      complaint.roomNumber,
      RealtimeEventType.COMPLAINT_STATUS_UPDATED,
      response,
      event.eventId,
    );

    return {
      processed: true,
      message: 'Complaint status updated successfully from MAD event.',
      complaint: response,
    };
  }

  private sanitizeInput(input: string): string {
    return input
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]') // Redact PANs
      .trim();
  }

  private buildTimeline(entity: FossComplaint): ComplaintTimelineStepDto[] {
    const isSubmitted = entity.status === ComplaintStatus.SUBMITTED;
    const isInvestigation =
      entity.status === ComplaintStatus.UNDER_INVESTIGATION;
    const isEscalated = entity.status === ComplaintStatus.ESCALATED;
    const isResolved = entity.status === ComplaintStatus.RESOLVED;

    const createdAtStr =
      entity.createdAt instanceof Date
        ? entity.createdAt.toISOString()
        : String(entity.createdAt);
    const updatedAtStr =
      entity.updatedAt instanceof Date
        ? entity.updatedAt.toISOString()
        : String(entity.updatedAt);

    const steps: ComplaintTimelineStepDto[] = [
      {
        status: ComplaintStatus.SUBMITTED,
        label: 'Complaint Submitted',
        completed: true,
        current: isSubmitted,
        timestamp: createdAtStr,
      },
      {
        status: ComplaintStatus.UNDER_INVESTIGATION,
        label: 'Under Investigation',
        completed: isInvestigation || isEscalated || isResolved,
        current: isInvestigation,
        timestamp: !isSubmitted ? updatedAtStr : undefined,
      },
    ];

    if (isEscalated) {
      steps.push({
        status: ComplaintStatus.ESCALATED,
        label: 'Escalated to Management',
        completed: true,
        current: true,
        timestamp: updatedAtStr,
      });
      steps.push({
        status: ComplaintStatus.RESOLVED,
        label: 'Resolved',
        completed: false,
        current: false,
      });
    } else {
      steps.push({
        status: ComplaintStatus.RESOLVED,
        label: 'Resolved',
        completed: isResolved,
        current: isResolved,
        timestamp: isResolved ? updatedAtStr : undefined,
      });
    }

    return steps;
  }

  private mapToResponse(entity: FossComplaint): ComplaintResponseDto {
    return {
      complaintId: entity.complaintId,
      bookingId: entity.bookingId,
      roomNumber: entity.roomNumber,
      category: entity.category,
      severity: entity.severity,
      subject: entity.subject,
      description: entity.description,
      status: entity.status,
      relatedOrderId: entity.relatedOrderId,
      relatedRequestId: entity.relatedRequestId,
      assignedManager: entity.assignedManager,
      resolutionNotes: entity.resolutionNotes,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : String(entity.createdAt),
      updatedAt:
        entity.updatedAt instanceof Date
          ? entity.updatedAt.toISOString()
          : String(entity.updatedAt),
      timeline: this.buildTimeline(entity),
    };
  }
}
