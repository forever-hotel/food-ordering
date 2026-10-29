import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
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
import { ComplaintResponseDto } from './dto/complaint-response.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { FossComplaint } from './entities/foss-complaint.entity.js';
import { ComplaintStatus } from './enums/complaint-status.enum.js';
import { FossComplaintRepository } from './repositories/foss-complaint.repository.js';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

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
   * Retrieves all complaints filed during the current authenticated guest stay.
   */
  public async getComplaints(
    guest: GuestContext,
  ): Promise<ComplaintResponseDto[]> {
    const complaints = await this.complaintRepository.findByBookingAndRoom(
      guest.bookingId,
      guest.roomNumber,
    );
    return complaints.map((c) => this.mapToResponse(c));
  }

  private sanitizeInput(input: string): string {
    return input
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]') // Redact PANs
      .trim();
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
    };
  }
}
