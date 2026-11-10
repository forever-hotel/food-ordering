import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import {
  TaskPriority,
  TaskType,
  WkmsCreateTaskDto,
} from '../../integrations/internal-services/wkms/dto/wkms-task.dto.js';
import { ActiveFossServiceCategory } from './enums/foss-service-category.enum.js';
import {
  WKMS_PROVIDER,
  WkmsProvider,
} from '../../integrations/internal-services/wkms/interfaces/wkms-provider.interface.js';
import { RealtimeEventType } from '../../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { FOSS_ROUTING_KEYS } from '../../messaging/messaging.constants.js';
import { RabbitMqPublisherService } from '../../messaging/rabbitmq-publisher.service.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { GetServiceRequestsQueryDto } from './dto/get-service-requests-query.dto.js';
import {
  ServiceRequestResponseDto,
  ServiceRequestTimelineStepDto,
} from './dto/service-request-response.dto.js';
import { WkmsTaskStatusUpdatedEventDto } from './dto/wkms-status-event.dto.js';
import { FossServiceRequest } from './entities/foss-service-request.entity.js';
import { ServiceRequestStatus } from './enums/service-request-status.enum.js';
import { FossServiceRequestRepository } from './repositories/foss-service-request.repository.js';

const STATUS_HIERARCHY: Record<ServiceRequestStatus, number> = {
  [ServiceRequestStatus.SUBMITTED]: 0,
  [ServiceRequestStatus.ASSIGNED]: 1,
  [ServiceRequestStatus.IN_PROGRESS]: 2,
  [ServiceRequestStatus.COMPLETED]: 3,
};

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly requestRepository: FossServiceRequestRepository,
    @Inject(WKMS_PROVIDER)
    private readonly wkmsProvider: WkmsProvider,
    private readonly configService: ConfigService,
    @Optional()
    private readonly realtimeService?: RealtimeService,
    @Optional()
    private readonly rabbitMqPublisher?: RabbitMqPublisherService,
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

    // Validate that category is an approved active FOSS category (reject before dispatching to WKMS to prevent partial-failure and database enum errors)
    if (
      !Object.values(ActiveFossServiceCategory).includes(
        dto.requestType as ActiveFossServiceCategory,
      )
    ) {
      throw new BadRequestException(
        `Invalid or unsupported service request category [${dto.requestType}]. Must be one of: ${Object.values(ActiveFossServiceCategory).join(', ')}`,
      );
    }

    // Check for existing request with this idempotency key
    const existing =
      await this.requestRepository.findByIdempotencyKey(idempotencyKey);
    if (
      existing &&
      (this.configService.get<string>('SHARED_DATABASE_MODE') !== 'true' ||
        existing.taskId)
    ) {
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
    const wkmsTaskType = this.translateCategoryToWkmsTaskType(dto.requestType);
    const wkmsDescription = this.formatWkmsTaskDescription(
      dto.requestType,
      dto.description,
    );

    // Dispatch to WKMS
    const wkmsTaskDto: WkmsCreateTaskDto = {
      roomNumber: guest.roomNumber,
      bookingId: guest.bookingId,
      taskType: wkmsTaskType,
      description: wkmsDescription,
      priority,
      idempotencyKey,
    };

    let wkmsResult;
    try {
      this.logger.log(
        `Dispatching service request to WKMS for room [${guest.roomNumber}] type [${wkmsTaskType}] (FOSS category: [${dto.requestType}])`,
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
    const publicRef =
      wkmsResult.taskId ||
      `req-sr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isUuid = (val?: string): boolean =>
      Boolean(
        val &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          val,
        ),
      );
    const requestUuid =
      (wkmsResult as typeof wkmsResult & { requestId?: string }).requestId ||
      (isUuid(wkmsResult.taskId)
        ? (wkmsResult.taskId as string)
        : randomUUID());

    const entity = new FossServiceRequest();
    entity.requestId = requestUuid;
    entity.publicReference = publicRef;
    entity.bookingId = guest.bookingId;
    entity.roomNumber = guest.roomNumber;
    entity.category = dto.requestType;
    entity.description = dto.description ?? null;
    entity.status = wkmsResult.status || ServiceRequestStatus.SUBMITTED;
    entity.priority = priority;
    entity.taskId = wkmsResult.taskId || requestUuid;
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
          if (
            raceExisting.roomNumber !== guest.roomNumber ||
            raceExisting.bookingId !== guest.bookingId
          ) {
            throw new ForbiddenException(
              'Idempotency key has already been used by a different room or booking.',
            );
          }
          return this.mapToResponse(raceExisting);
        }
      }
      throw err;
    }

    const response = this.mapToResponse(entity);
    this.realtimeService?.emitToStay(
      guest.bookingId,
      guest.roomNumber,
      RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      response,
    );

    void this.rabbitMqPublisher?.publishEvent(
      FOSS_ROUTING_KEYS.SERVICE_REQUEST_CREATED,
      {
        requestId: entity.requestId,
        bookingId: entity.bookingId,
        roomNumber: entity.roomNumber,
        category: entity.category,
        priority: entity.priority,
        createdAt: entity.createdAt.toISOString(),
      },
    );

    return response;
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
   * Retrieves all service requests for the current authenticated guest stay with optional filtering.
   */
  public async getGuestServiceRequests(
    guest: GuestContext,
    query?: GetServiceRequestsQueryDto,
  ): Promise<ServiceRequestResponseDto[]> {
    const requests = await this.requestRepository.findByBookingAndRoom(
      guest.bookingId,
      guest.roomNumber,
      query,
    );
    return requests.map((req) => this.mapToResponse(req));
  }

  /**
   * Deterministic status advance utility gated by DEMO_MODE for demonstration rehearsal flows.
   * Rejects illegal status regressions with ConflictException (409).
   */
  public async advanceServiceRequestStatus(
    guest: GuestContext,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): Promise<ServiceRequestResponseDto> {
    const isDevOrTest =
      !process.env.NODE_ENV ||
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test';
    const isDemo = this.configService.get<string>('DEMO_MODE') === 'true';
    if (!isDemo || !isDevOrTest || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Demo status advancement is only permitted in development/test environments when DEMO_MODE is enabled.',
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

    const currentIndex = STATUS_HIERARCHY[request.status];
    const newIndex = STATUS_HIERARCHY[newStatus];

    if (newIndex < currentIndex) {
      throw new ConflictException(
        `Illegal status regression: cannot advance service request [${requestId}] from [${request.status}] to [${newStatus}].`,
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
    const response = this.mapToResponse(request);
    this.realtimeService?.emitToStay(
      guest.bookingId,
      guest.roomNumber,
      RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      response,
    );
    return response;
  }

  /**
   * Consumes signed task status events from WKMS.
   * Deduplicates event IDs, guards against room spoofing, discards stale/out-of-order events,
   * and advances request lifecycle.
   */
  public async handleWkmsStatusEvent(
    event: WkmsTaskStatusUpdatedEventDto,
  ): Promise<{
    processed: boolean;
    message: string;
    request?: ServiceRequestResponseDto;
  }> {
    if (this.processedEventIds.has(event.eventId)) {
      this.logger.log(
        `Duplicate WKMS event [${event.eventId}] discarded: event already processed.`,
      );
      return {
        processed: true,
        message: 'Duplicate event already processed.',
      };
    }

    let request = await this.requestRepository.findById(event.requestId);
    if (!request) {
      request = await this.requestRepository.findByTaskId(event.requestId);
    }

    if (!request) {
      this.logger.warn(
        `WKMS event [${event.eventId}] rejected: Service request [${event.requestId}] not found.`,
      );
      throw new NotFoundException(
        `Service request with ID [${event.requestId}] was not found.`,
      );
    }

    if (event.roomNumber && request.roomNumber !== event.roomNumber) {
      this.logger.warn(
        `WKMS event [${event.eventId}] forbidden: room mismatch (event room [${event.roomNumber}] vs request room [${request.roomNumber}]).`,
      );
      throw new ForbiddenException(
        'Event roomNumber does not match service request roomNumber.',
      );
    }

    // Stale event detection based on occurredAt vs updatedAt
    if (event.occurredAt && request.updatedAt) {
      const eventTime = new Date(event.occurredAt).getTime();
      const requestUpdateTime = new Date(request.updatedAt).getTime();
      if (
        !isNaN(eventTime) &&
        !isNaN(requestUpdateTime) &&
        eventTime < requestUpdateTime
      ) {
        this.logger.warn(
          `Stale WKMS event [${event.eventId}] discarded: event occurredAt [${event.occurredAt}] is older than current request updatedAt [${request.updatedAt.toISOString()}].`,
        );
        this.processedEventIds.add(event.eventId);
        return {
          processed: false,
          message: 'Stale event discarded without updating state.',
          request: this.mapToResponse(request),
        };
      }
    }

    // State regression guard: cannot roll back newer status
    const currentIndex = STATUS_HIERARCHY[request.status];
    const newIndex = STATUS_HIERARCHY[event.status];

    if (newIndex < currentIndex) {
      this.logger.warn(
        `Out-of-order WKMS event [${event.eventId}] discarded: cannot regress status from [${request.status}] to [${event.status}].`,
      );
      this.processedEventIds.add(event.eventId);
      return {
        processed: false,
        message: 'Out-of-order status regression event discarded.',
        request: this.mapToResponse(request),
      };
    }

    // Update state
    request.status = event.status;
    request.updatedAt = new Date();
    if (event.assignedStaff) {
      request.assignedStaff = event.assignedStaff;
    }
    if (event.status === ServiceRequestStatus.COMPLETED) {
      request.estimatedCompletionMinutes = 0;
    }

    await this.requestRepository.save(request);
    this.processedEventIds.add(event.eventId);

    this.logger.log(
      `WKMS event [${event.eventId}] applied: request [${request.requestId}] status transitioned to [${request.status}].`,
    );

    const response = this.mapToResponse(request);
    this.realtimeService?.emitToStay(
      request.bookingId,
      request.roomNumber,
      RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      response,
      event.eventId,
    );

    return {
      processed: true,
      message: 'Service request status updated successfully from WKMS event.',
      request: response,
    };
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
      requestId: request.publicReference || request.requestId,
      roomNumber: request.roomNumber,
      bookingId: request.bookingId,
      requestType: request.requestType,
      description: request.description ?? null,
      status: request.status,
      priority: request.priority,
      assignedStaff: request.assignedStaff ?? null,
      estimatedCompletionMinutes: request.estimatedCompletionMinutes,
      taskId: request.taskId ?? null,
      idempotencyKey: request.idempotencyKey || '',
      createdAt: createdAtDate.toISOString(),
      updatedAt: updatedAtDate.toISOString(),
      timeline: this.buildTimeline(request, createdAtDate, updatedAtDate),
    };
  }

  private buildTimeline(
    request: FossServiceRequest,
    createdAtDate: Date,
    _updatedAtDate: Date,
  ): ServiceRequestTimelineStepDto[] {
    const createdAtIso = createdAtDate.toISOString();

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

    const parseIso = (val?: Date | string | null): string | undefined => {
      if (!val) return undefined;
      const d = val instanceof Date ? val : new Date(val);
      return !isNaN(d.getTime()) ? d.toISOString() : undefined;
    };

    const submittedIso =
      parseIso(request.timelineTimestamps?.submittedAt) || createdAtIso;
    const assignedIso = parseIso(request.timelineTimestamps?.assignedAt);
    const inProgressIso = parseIso(request.timelineTimestamps?.inProgressAt);
    const completedIso =
      parseIso(request.timelineTimestamps?.completedAt) ||
      parseIso(request.completedAt);

    return steps.map((step, idx) => {
      const completed = idx <= currentIndex;
      const current = idx === currentIndex;
      let timestamp: string | undefined;

      if (idx === 0) {
        timestamp = submittedIso;
      } else if (idx === 1) {
        if (completed) {
          timestamp = assignedIso;
        }
      } else if (idx === 2) {
        if (completed) {
          timestamp = inProgressIso;
        }
      } else if (idx === 3) {
        if (completed) {
          timestamp = completedIso;
        }
      }

      return {
        status: step.status,
        label: step.label,
        completed,
        current,
        timestamp,
      };
    });
  }

  /**
   * Translates an active FOSS service category to an upstream WKMS TaskType.
   * Only the six approved active categories are dispatched:
   * ROOM_CLEANING -> ROOM_CLEANING
   * EXTRA_TOWELS -> EXTRA_TOWELS
   * TOILETRIES -> TOILETRIES
   * MAINTENANCE -> MAINTENANCE
   * LAUNDRY_PICKUP -> LAUNDRY_PICKUP
   * OTHER -> OTHER
   *
   * Rejects WATER_BOTTLES and unknown categories explicitly without silent fallback.
   */
  public translateCategoryToWkmsTaskType(category: string): TaskType {
    switch (category) {
      case ActiveFossServiceCategory.ROOM_CLEANING:
        return TaskType.ROOM_CLEANING;
      case ActiveFossServiceCategory.EXTRA_TOWELS:
        return TaskType.EXTRA_TOWELS;
      case ActiveFossServiceCategory.TOILETRIES:
        return TaskType.TOILETRIES;
      case ActiveFossServiceCategory.MAINTENANCE:
        return TaskType.MAINTENANCE;
      case ActiveFossServiceCategory.LAUNDRY_PICKUP:
        return TaskType.LAUNDRY_PICKUP;
      case ActiveFossServiceCategory.OTHER:
        return TaskType.OTHER;
      default:
        throw new BadRequestException(
          `Cannot dispatch unsupported or legacy service category [${category}] to WKMS.`,
        );
    }
  }

  /**
   * Prepares the task description for WKMS workers.
   * Passes through guest instructions directly without alteration.
   */
  public formatWkmsTaskDescription(
    _category: string,
    guestInstructions?: string,
  ): string | undefined {
    return guestInstructions?.trim() || undefined;
  }
}
