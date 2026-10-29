import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import {
  TaskPriority,
  WkmsCreateTaskDto,
} from '../../integrations/internal-services/wkms/dto/wkms-task.dto.js';
import {
  WKMS_PROVIDER,
  WkmsProvider,
} from '../../integrations/internal-services/wkms/interfaces/wkms-provider.interface.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import {
  ServiceRequestResponseDto,
  ServiceRequestTimelineStepDto,
} from './dto/service-request-response.dto.js';
import { FossServiceRequest } from './entities/foss-service-request.entity.js';
import { ServiceRequestStatus } from './enums/service-request-status.enum.js';
import { FossServiceRequestRepository } from './repositories/foss-service-request.repository.js';

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

  constructor(
    private readonly requestRepository: FossServiceRequestRepository,
    @Inject(WKMS_PROVIDER)
    private readonly wkmsProvider: WkmsProvider,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates a room-bound service request, persists it to Neon, and dispatches a worker task to WKMS.
   */
  public async createServiceRequest(
    guest: GuestContext,
    dto: CreateServiceRequestDto,
    idempotencyKeyHeader?: string,
  ): Promise<ServiceRequestResponseDto> {
    const idempotencyKey =
      idempotencyKeyHeader ||
      dto.idempotencyKey ||
      `idemp-sr-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Check for existing request with this idempotency key
    const existing =
      await this.requestRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (
        existing.roomNumber !== guest.roomNumber ||
        existing.bookingId !== guest.bookingId
      ) {
        throw new ForbiddenException(
          'Idempotency key has already been used by a different room or booking.',
        );
      }
      this.logger.log(
        `Idempotent service request replay: returning existing request [${existing.requestId}] for room [${guest.roomNumber}].`,
      );
      return this.mapToResponse(existing);
    }

    const priority = dto.priority || TaskPriority.NORMAL;

    // Dispatch to WKMS
    const wkmsTaskDto: WkmsCreateTaskDto = {
      roomNumber: guest.roomNumber,
      bookingId: guest.bookingId,
      taskType: dto.requestType,
      description: dto.description,
      priority,
      idempotencyKey,
    };

    let wkmsResult;
    try {
      this.logger.log(
        `Dispatching service request to WKMS for room [${guest.roomNumber}] type [${dto.requestType}]`,
      );
      wkmsResult = await this.wkmsProvider.createTask(wkmsTaskDto);
    } catch (err: unknown) {
      if (err instanceof UpstreamServiceUnavailableException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to dispatch service request to WKMS: ${msg}`);
      throw new UpstreamServiceUnavailableException('WKMS', msg);
    }

    const now = new Date();
    const requestId =
      wkmsResult.taskId ||
      `req-sr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const entity = new FossServiceRequest();
    entity.requestId = requestId;
    entity.bookingId = guest.bookingId;
    entity.roomNumber = guest.roomNumber;
    entity.requestType = dto.requestType;
    entity.description = dto.description ?? null;
    entity.status = wkmsResult.status || ServiceRequestStatus.SUBMITTED;
    entity.priority = priority;
    entity.taskId = wkmsResult.taskId || requestId;
    entity.assignedStaff = wkmsResult.assignedStaff ?? null;
    entity.estimatedCompletionMinutes =
      wkmsResult.estimatedCompletionMinutes ?? 20;
    entity.idempotencyKey = idempotencyKey;
    entity.createdAt = now;
    entity.updatedAt = now;

    try {
      await this.requestRepository.save(entity);
    } catch (err: unknown) {
      // Handle race condition on duplicate idempotency key
      const duplicateError = err as { code?: string; message?: string };
      if (
        duplicateError?.code === '23505' ||
        duplicateError?.message?.includes('duplicate key') ||
        duplicateError?.message?.includes('UNIQUE constraint')
      ) {
        const raceExisting =
          await this.requestRepository.findByIdempotencyKey(idempotencyKey);
        if (raceExisting) {
          return this.mapToResponse(raceExisting);
        }
      }
      throw err;
    }

    return this.mapToResponse(entity);
  }

  /**
   * Retrieves a service request by ID ensuring room and booking scope.
   */
  public async getGuestServiceRequestById(
    guest: GuestContext,
    requestId: string,
  ): Promise<ServiceRequestResponseDto> {
    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException(
        `Service request [${requestId}] was not found.`,
      );
    }

    if (
      request.roomNumber !== guest.roomNumber ||
      request.bookingId !== guest.bookingId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view service requests from another room or booking.',
      );
    }

    return this.mapToResponse(request);
  }

  /**
   * Retrieves all service requests for the current authenticated guest stay.
   */
  public async getGuestServiceRequests(
    guest: GuestContext,
  ): Promise<ServiceRequestResponseDto[]> {
    const requests = await this.requestRepository.findByBookingAndRoom(
      guest.bookingId,
      guest.roomNumber,
    );
    return requests.map((req) => this.mapToResponse(req));
  }

  /**
   * Deterministic status advance utility gated by DEMO_MODE for demonstration rehearsal flows.
   */
  public async advanceServiceRequestStatus(
    guest: GuestContext,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): Promise<ServiceRequestResponseDto> {
    const isDemo = this.configService.get<string>('DEMO_MODE') === 'true';
    if (!isDemo) {
      throw new ForbiddenException(
        'Demo status advancement is only permitted when DEMO_MODE is enabled.',
      );
    }

    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException(
        `Service request [${requestId}] was not found.`,
      );
    }

    if (
      request.roomNumber !== guest.roomNumber ||
      request.bookingId !== guest.bookingId
    ) {
      throw new ForbiddenException(
        'You do not have permission to modify service requests from another room or booking.',
      );
    }

    if (request.taskId) {
      await this.wkmsProvider.transitionTaskStatus(
        request.taskId,
        newStatus,
        assignedStaff,
      );
    }

    request.status = newStatus;
    request.updatedAt = new Date();
    if (assignedStaff) {
      request.assignedStaff = assignedStaff;
    }
    if (newStatus === ServiceRequestStatus.COMPLETED) {
      request.estimatedCompletionMinutes = 0;
    }

    await this.requestRepository.save(request);
    return this.mapToResponse(request);
  }

  private mapToResponse(
    request: FossServiceRequest,
  ): ServiceRequestResponseDto {
    const now = new Date();
    const createdAtDate =
      request.createdAt instanceof Date && !isNaN(request.createdAt.getTime())
        ? request.createdAt
        : now;
    const updatedAtDate =
      request.updatedAt instanceof Date && !isNaN(request.updatedAt.getTime())
        ? request.updatedAt
        : now;

    return {
      requestId: request.requestId,
      roomNumber: request.roomNumber,
      bookingId: request.bookingId,
      requestType: request.requestType,
      description: request.description ?? null,
      status: request.status,
      priority: request.priority,
      assignedStaff: request.assignedStaff ?? null,
      estimatedCompletionMinutes: request.estimatedCompletionMinutes,
      taskId: request.taskId ?? null,
      idempotencyKey: request.idempotencyKey,
      createdAt: createdAtDate.toISOString(),
      updatedAt: updatedAtDate.toISOString(),
      timeline: this.buildTimeline(request, createdAtDate, updatedAtDate),
    };
  }

  private buildTimeline(
    request: FossServiceRequest,
    createdAtDate: Date,
    updatedAtDate: Date,
  ): ServiceRequestTimelineStepDto[] {
    const createdAtIso = createdAtDate.toISOString();
    const updatedAtIso = updatedAtDate.toISOString();

    const steps = [
      {
        status: ServiceRequestStatus.SUBMITTED,
        label: 'Request Submitted',
      },
      {
        status: ServiceRequestStatus.ASSIGNED,
        label: 'Worker Assigned',
      },
      {
        status: ServiceRequestStatus.IN_PROGRESS,
        label: 'Service In Progress',
      },
      {
        status: ServiceRequestStatus.COMPLETED,
        label: 'Service Completed',
      },
    ];

    const statusHierarchy = [
      ServiceRequestStatus.SUBMITTED,
      ServiceRequestStatus.ASSIGNED,
      ServiceRequestStatus.IN_PROGRESS,
      ServiceRequestStatus.COMPLETED,
    ];

    const currentIndex = statusHierarchy.indexOf(request.status);

    return steps.map((step, idx) => ({
      status: step.status,
      label: step.label,
      completed: idx <= currentIndex,
      current: idx === currentIndex,
      timestamp:
        idx === 0
          ? createdAtIso
          : idx === currentIndex
            ? updatedAtIso
            : undefined,
    }));
  }
}
