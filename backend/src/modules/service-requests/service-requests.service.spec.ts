import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import { MockWkmsAdapter } from '../../integrations/internal-services/wkms/adapters/mock-wkms.adapter.js';
import {
  TaskPriority,
  TaskType,
} from '../../integrations/internal-services/wkms/dto/wkms-task.dto.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { GetServiceRequestsQueryDto } from './dto/get-service-requests-query.dto.js';
import { WkmsTaskStatusUpdatedEventDto } from './dto/wkms-status-event.dto.js';
import { FossServiceRequest } from './entities/foss-service-request.entity.js';
import {
  ActiveFossServiceCategory,
  FossServiceCategory,
} from './enums/foss-service-category.enum.js';
import { ServiceRequestStatus } from './enums/service-request-status.enum.js';
import { FossServiceRequestRepository } from './repositories/foss-service-request.repository.js';
import { ServiceRequestsService } from './service-requests.service.js';

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let mockRequestRepository: jest.Mocked<FossServiceRequestRepository>;
  let mockWkms: MockWkmsAdapter;
  let mockConfigService: jest.Mocked<ConfigService>;

  const sampleGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: 'booking-uuid-101',
    guestId: 'guest-uuid-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    role: 'GUEST',
  };

  const validDto: CreateServiceRequestDto = {
    requestType: TaskType.EXTRA_TOWELS,
    description: 'Please bring 2 extra towels',
    priority: TaskPriority.NORMAL,
    idempotencyKey: 'idemp-test-sr-001',
  };

  beforeEach(() => {
    mockRequestRepository = {
      save: jest.fn<any>().mockImplementation(async (entity: any) => entity),
      findById: jest.fn<any>(),
      findByTaskId: jest.fn<any>(),
      findByBookingAndRoom: jest.fn<any>(),
      findByIdempotencyKey: jest.fn<any>(),
    } as unknown as jest.Mocked<FossServiceRequestRepository>;

    mockWkms = new MockWkmsAdapter();

    mockConfigService = {
      get: jest.fn<any>().mockImplementation((key?: string) => {
        if (key === 'DEMO_MODE') return 'true';
        if (key === 'MOCK_EXTERNAL_SERVICES') return 'true';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new ServiceRequestsService(
      mockRequestRepository,
      mockWkms,
      mockConfigService,
    );
  });

  describe('createServiceRequest()', () => {
    it('preserves an upstream idempotency conflict instead of reporting an outage', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(null);
      jest
        .spyOn(mockWkms, 'createTask')
        .mockRejectedValueOnce(
          new ConflictException('Idempotency key has a different request'),
        );
      await expect(
        service.createServiceRequest(sampleGuest, validDto),
      ).rejects.toThrow(ConflictException);
      expect(mockRequestRepository.save).not.toHaveBeenCalled();
    });
    it('creates and dispatches a room-bound service request successfully', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(null);

      const response = await service.createServiceRequest(
        sampleGuest,
        validDto,
      );

      expect(response).toBeDefined();
      expect(response.roomNumber).toBe('101');
      expect(response.bookingId).toBe('booking-uuid-101');
      expect(response.requestType).toBe(TaskType.EXTRA_TOWELS);
      expect(response.description).toBe('Please bring 2 extra towels');
      expect(response.status).toBe(ServiceRequestStatus.SUBMITTED);
      expect(response.estimatedCompletionMinutes).toBe(20);
      expect(response.timeline).toHaveLength(4);
      expect(response.timeline[0]?.status).toBe(ServiceRequestStatus.SUBMITTED);
      expect(response.timeline[0]?.current).toBe(true);

      expect(mockRequestRepository.save).toHaveBeenCalled();
    });

    it('returns existing request on duplicate submission with same idempotency key (idempotent replay)', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-existing-123';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.requestType = TaskType.EXTRA_TOWELS;
      existing.description = 'Please bring 2 extra towels';
      existing.status = ServiceRequestStatus.SUBMITTED;
      existing.priority = TaskPriority.NORMAL;
      existing.idempotencyKey = 'idemp-test-sr-001';
      existing.createdAt = new Date();
      existing.updatedAt = new Date();

      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(existing);

      const response = await service.createServiceRequest(
        sampleGuest,
        validDto,
      );

      expect(response.requestId).toBe('req-existing-123');
      expect(mockRequestRepository.save).not.toHaveBeenCalled();
    });

    it('rejects reuse of an idempotency key across different rooms with 403 Forbidden', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-diff-room';
      existing.bookingId = 'different-booking';
      existing.roomNumber = '999';
      existing.idempotencyKey = 'idemp-test-sr-001';

      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(existing);

      await expect(
        service.createServiceRequest(sampleGuest, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propagates UpstreamServiceUnavailableException when WKMS fails', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(null);
      mockWkms.setSimulateDown(true);

      await expect(
        service.createServiceRequest(sampleGuest, validDto),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('rejects unsupported categories such as LUGGAGE_ASSISTANCE safely', async () => {
      await expect(
        service.createServiceRequest(sampleGuest, {
          requestType: 'LUGGAGE_ASSISTANCE',
          description: 'Help with bags',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createServiceRequest(sampleGuest, {
          requestType: 'BABY_COT',
          description: 'Crib requested',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly maps TOILETRIES to WKMS TOILETRIES task with preserved description', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(null);
      const createTaskSpy = jest.spyOn(mockWkms, 'createTask');

      const response = await service.createServiceRequest(sampleGuest, {
        requestType: ActiveFossServiceCategory.TOILETRIES,
        description: 'Extra shampoo and dental kit',
        idempotencyKey: 'idemp-toiletries-001',
      });

      expect(response.requestType).toBe(ActiveFossServiceCategory.TOILETRIES);
      expect(response.description).toBe('Extra shampoo and dental kit');
      expect(createTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: TaskType.TOILETRIES,
          description: 'Extra shampoo and dental kit',
        }),
      );
      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ActiveFossServiceCategory.TOILETRIES,
          description: 'Extra shampoo and dental kit',
        }),
      );
    });

    it('rejects legacy WATER_BOTTLES submission with BadRequestException', async () => {
      await expect(
        service.createServiceRequest(sampleGuest, {
          requestType: FossServiceCategory.WATER_BOTTLES,
          idempotencyKey: 'idemp-water-reject-001',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly maps LAUNDRY_PICKUP to WKMS LAUNDRY_PICKUP task', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValue(null);
      const createTaskSpy = jest.spyOn(mockWkms, 'createTask');

      const response = await service.createServiceRequest(sampleGuest, {
        requestType: FossServiceCategory.LAUNDRY_PICKUP,
        description: 'Dry cleaning 2 shirts',
        idempotencyKey: 'idemp-laundry-001',
      });

      expect(response.requestType).toBe(FossServiceCategory.LAUNDRY_PICKUP);
      expect(createTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: TaskType.LAUNDRY_PICKUP,
          description: 'Dry cleaning 2 shirts',
        }),
      );
      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category: FossServiceCategory.LAUNDRY_PICKUP,
        }),
      );
    });

    it('handles concurrent duplicate key race condition gracefully', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);

      const existing = new FossServiceRequest();
      existing.requestId = 'req-race-winner';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.requestType = TaskType.EXTRA_TOWELS;
      existing.status = ServiceRequestStatus.SUBMITTED;
      existing.priority = TaskPriority.NORMAL;
      existing.idempotencyKey = 'idemp-test-sr-001';
      existing.createdAt = new Date();
      existing.updatedAt = new Date();

      mockRequestRepository.save.mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      });
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existing,
      );

      const response = await service.createServiceRequest(
        sampleGuest,
        validDto,
      );
      expect(response.requestId).toBe('req-race-winner');
    });
  });

  describe('getGuestServiceRequestById()', () => {
    it('returns service request when room and booking match', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-101';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = sampleGuest.roomNumber;
      req.requestType = TaskType.ROOM_CLEANING;
      req.status = ServiceRequestStatus.SUBMITTED;
      req.priority = TaskPriority.NORMAL;
      req.createdAt = new Date();
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);

      const result = await service.getGuestServiceRequestById(
        sampleGuest,
        'req-101',
      );
      expect(result.requestId).toBe('req-101');
      expect(result.timeline).toBeDefined();
    });

    it('throws NotFoundException when request does not exist', async () => {
      mockRequestRepository.findById.mockResolvedValue(null);

      await expect(
        service.getGuestServiceRequestById(sampleGuest, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when request belongs to another room', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-999';
      req.bookingId = 'booking-999';
      req.roomNumber = '999';

      mockRequestRepository.findById.mockResolvedValue(req);

      await expect(
        service.getGuestServiceRequestById(sampleGuest, 'req-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getGuestServiceRequests()', () => {
    it('returns all service requests for current stay', async () => {
      const req1 = new FossServiceRequest();
      req1.requestId = 'req-1';
      req1.bookingId = sampleGuest.bookingId;
      req1.roomNumber = sampleGuest.roomNumber;
      req1.requestType = TaskType.EXTRA_TOWELS;
      req1.status = ServiceRequestStatus.SUBMITTED;
      req1.priority = TaskPriority.NORMAL;
      req1.createdAt = new Date();
      req1.updatedAt = new Date();

      mockRequestRepository.findByBookingAndRoom.mockResolvedValue([req1]);

      const result = await service.getGuestServiceRequests(sampleGuest);
      expect(result).toHaveLength(1);
      expect(result[0]?.requestId).toBe('req-1');
      expect(mockRequestRepository.findByBookingAndRoom).toHaveBeenCalledWith(
        sampleGuest.bookingId,
        sampleGuest.roomNumber,
        undefined,
      );
    });

    it('passes status and type filter parameters to repository', async () => {
      mockRequestRepository.findByBookingAndRoom.mockResolvedValue([]);

      const query: GetServiceRequestsQueryDto = {
        status: ServiceRequestStatus.SUBMITTED,
        requestType: TaskType.EXTRA_TOWELS,
        limit: 10,
        offset: 5,
      };

      await service.getGuestServiceRequests(sampleGuest, query);

      expect(mockRequestRepository.findByBookingAndRoom).toHaveBeenCalledWith(
        sampleGuest.bookingId,
        sampleGuest.roomNumber,
        query,
      );
    });
  });

  describe('advanceServiceRequestStatus() [DEMO_MODE]', () => {
    it('advances service request status and worker assignment when DEMO_MODE is true', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-demo-001';
      req.taskId = 'task-demo-001';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = sampleGuest.roomNumber;
      req.requestType = TaskType.ROOM_CLEANING;
      req.status = ServiceRequestStatus.SUBMITTED;
      req.priority = TaskPriority.NORMAL;
      req.createdAt = new Date();
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);
      (mockWkms as any).tasks.set('task-demo-001', {
        taskId: 'task-demo-001',
        roomNumber: sampleGuest.roomNumber,
        bookingId: sampleGuest.bookingId,
        taskType: TaskType.ROOM_CLEANING,
        status: ServiceRequestStatus.SUBMITTED,
        priority: TaskPriority.NORMAL,
        assignedStaff: null,
        estimatedCompletionMinutes: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.advanceServiceRequestStatus(
        sampleGuest,
        'req-demo-001',
        ServiceRequestStatus.ASSIGNED,
        'Staff Housekeeping #14',
      );

      expect(result.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(result.assignedStaff).toBe('Staff Housekeeping #14');
      expect(mockRequestRepository.save).toHaveBeenCalled();
    });

    it('rejects illegal status regression with 409 ConflictException', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-demo-regression';
      req.taskId = 'task-demo-regression';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = sampleGuest.roomNumber;
      req.requestType = TaskType.ROOM_CLEANING;
      req.status = ServiceRequestStatus.IN_PROGRESS;
      req.priority = TaskPriority.NORMAL;
      req.createdAt = new Date();
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);

      await expect(
        service.advanceServiceRequestStatus(
          sampleGuest,
          'req-demo-regression',
          ServiceRequestStatus.SUBMITTED,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('resets estimated completion minutes to 0 when status reaches COMPLETED', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-demo-002';
      req.taskId = 'task-demo-002';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = sampleGuest.roomNumber;
      req.requestType = TaskType.MAINTENANCE;
      req.status = ServiceRequestStatus.IN_PROGRESS;
      req.priority = TaskPriority.NORMAL;
      req.createdAt = new Date();
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);
      (mockWkms as any).tasks.set('task-demo-002', {
        taskId: 'task-demo-002',
        roomNumber: sampleGuest.roomNumber,
        bookingId: sampleGuest.bookingId,
        taskType: TaskType.MAINTENANCE,
        status: ServiceRequestStatus.IN_PROGRESS,
        priority: TaskPriority.NORMAL,
        assignedStaff: 'Maintenance Staff #03',
        estimatedCompletionMinutes: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.advanceServiceRequestStatus(
        sampleGuest,
        'req-demo-002',
        ServiceRequestStatus.COMPLETED,
      );

      expect(result.status).toBe(ServiceRequestStatus.COMPLETED);
      expect(result.estimatedCompletionMinutes).toBe(0);
    });

    it('rejects status advancement when DEMO_MODE is false with 403 Forbidden', async () => {
      mockConfigService.get.mockReturnValueOnce('false');

      await expect(
        service.advanceServiceRequestStatus(
          sampleGuest,
          'req-demo-001',
          ServiceRequestStatus.ASSIGNED,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when request does not exist', async () => {
      mockRequestRepository.findById.mockResolvedValue(null);

      await expect(
        service.advanceServiceRequestStatus(
          sampleGuest,
          'non-existent',
          ServiceRequestStatus.ASSIGNED,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException on cross-room status advancement attempt', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-other-room';
      req.bookingId = 'booking-999';
      req.roomNumber = '999';

      mockRequestRepository.findById.mockResolvedValue(req);

      await expect(
        service.advanceServiceRequestStatus(
          sampleGuest,
          'req-other-room',
          ServiceRequestStatus.ASSIGNED,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleWkmsStatusEvent()', () => {
    it('applies WKMS status event and updates request lifecycle successfully', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-wkms-001';
      req.taskId = 'task-wkms-001';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = '101';
      req.requestType = TaskType.ROOM_CLEANING;
      req.status = ServiceRequestStatus.SUBMITTED;
      req.priority = TaskPriority.NORMAL;
      req.createdAt = new Date('2026-10-28T07:00:00.000Z');
      req.updatedAt = new Date('2026-10-28T07:00:00.000Z');

      mockRequestRepository.findById.mockResolvedValue(req);

      const event: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        requestId: 'req-wkms-001',
        roomNumber: '101',
        status: ServiceRequestStatus.ASSIGNED,
        assignedStaff: 'Staff #42',
        occurredAt: '2026-10-28T07:05:00.000Z',
      };

      const result = await service.handleWkmsStatusEvent(event);

      expect(result.processed).toBe(true);
      expect(result.request?.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(result.request?.assignedStaff).toBe('Staff #42');
      expect(mockRequestRepository.save).toHaveBeenCalled();
    });

    it('deduplicates duplicate eventId without mutating entity again', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-wkms-dedup';
      req.roomNumber = '101';
      req.bookingId = sampleGuest.bookingId;
      req.status = ServiceRequestStatus.SUBMITTED;
      req.updatedAt = new Date('2026-10-28T07:00:00.000Z');

      mockRequestRepository.findById.mockResolvedValue(req);

      const event: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440099',
        requestId: 'req-wkms-dedup',
        roomNumber: '101',
        status: ServiceRequestStatus.ASSIGNED,
        occurredAt: '2026-10-28T07:05:00.000Z',
      };

      // First call processes it
      await service.handleWkmsStatusEvent(event);

      // Second call with same eventId
      const result = await service.handleWkmsStatusEvent(event);

      expect(result.processed).toBe(true);
      expect(result.message).toContain('already processed');
    });

    it('throws NotFoundException when event references non-existent request', async () => {
      mockRequestRepository.findById.mockResolvedValue(null);
      mockRequestRepository.findByTaskId.mockResolvedValue(null);

      const event: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        requestId: 'req-unknown',
        roomNumber: '101',
        status: ServiceRequestStatus.ASSIGNED,
        occurredAt: '2026-10-28T07:10:00.000Z',
      };

      await expect(service.handleWkmsStatusEvent(event)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when event roomNumber mismatches request room', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-wkms-002';
      req.roomNumber = '101';
      req.bookingId = 'booking-101';
      req.status = ServiceRequestStatus.SUBMITTED;
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);

      const event: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        requestId: 'req-wkms-002',
        roomNumber: '999', // Mismatch!
        status: ServiceRequestStatus.ASSIGNED,
        occurredAt: new Date().toISOString(),
      };

      await expect(service.handleWkmsStatusEvent(event)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('discards stale events where occurredAt is older than request updatedAt', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-wkms-stale';
      req.roomNumber = '101';
      req.bookingId = 'booking-101';
      req.status = ServiceRequestStatus.IN_PROGRESS;
      req.createdAt = new Date('2026-10-28T07:00:00.000Z');
      req.updatedAt = new Date('2026-10-28T07:30:00.000Z');

      mockRequestRepository.findById.mockResolvedValue(req);

      const staleEvent: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440003',
        requestId: 'req-wkms-stale',
        roomNumber: '101',
        status: ServiceRequestStatus.IN_PROGRESS,
        occurredAt: '2026-10-28T07:15:00.000Z', // older than 07:30:00!
      };

      const result = await service.handleWkmsStatusEvent(staleEvent);

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Stale event discarded');
    });

    it('discards out-of-order status regression events without rolling back newer status', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-wkms-completed';
      req.roomNumber = '101';
      req.bookingId = 'booking-101';
      req.status = ServiceRequestStatus.COMPLETED;
      req.createdAt = new Date('2026-10-28T07:00:00.000Z');
      req.updatedAt = new Date('2026-10-28T07:30:00.000Z');

      mockRequestRepository.findById.mockResolvedValue(req);

      const regressionEvent: WkmsTaskStatusUpdatedEventDto = {
        eventId: '550e8400-e29b-41d4-a716-446655440004',
        requestId: 'req-wkms-completed',
        roomNumber: '101',
        status: ServiceRequestStatus.IN_PROGRESS, // COMPLETED -> IN_PROGRESS regression!
        occurredAt: '2026-10-28T07:35:00.000Z',
      };

      const result = await service.handleWkmsStatusEvent(regressionEvent);

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Out-of-order status regression');
      expect(result.request?.status).toBe(ServiceRequestStatus.COMPLETED);
    });
  });

  describe('advanceServiceRequestStatus() [DEMO_MODE]', () => {
    it('advances service request status when DEMO_MODE is true in test/dev', async () => {
      const req = new FossServiceRequest();
      req.requestId = 'req-demo-001';
      req.bookingId = sampleGuest.bookingId;
      req.roomNumber = sampleGuest.roomNumber;
      req.status = ServiceRequestStatus.SUBMITTED;
      req.createdAt = new Date();
      req.updatedAt = new Date();

      mockRequestRepository.findById.mockResolvedValue(req);
      mockRequestRepository.save.mockResolvedValue(req);

      const result = await service.advanceServiceRequestStatus(
        sampleGuest,
        'req-demo-001',
        ServiceRequestStatus.ASSIGNED,
        'Staff #1',
      );

      expect(result.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(result.assignedStaff).toBe('Staff #1');
      expect(mockRequestRepository.save).toHaveBeenCalled();
    });

    it('rejects status advancement when DEMO_MODE is false with 403 Forbidden', async () => {
      mockConfigService.get.mockReturnValueOnce('false');

      await expect(
        service.advanceServiceRequestStatus(
          sampleGuest,
          'req-demo-001',
          ServiceRequestStatus.IN_PROGRESS,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly rejects status advancement when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          service.advanceServiceRequestStatus(
            sampleGuest,
            'req-demo-001',
            ServiceRequestStatus.IN_PROGRESS,
          ),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });

  describe('FOSS-to-WKMS Category & Description Translation', () => {
    it('translates all 6 approved active FOSS categories to corresponding WKMS task types', () => {
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.ROOM_CLEANING,
        ),
      ).toBe(TaskType.ROOM_CLEANING);
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.EXTRA_TOWELS,
        ),
      ).toBe(TaskType.EXTRA_TOWELS);
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.TOILETRIES,
        ),
      ).toBe(TaskType.TOILETRIES);
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.MAINTENANCE,
        ),
      ).toBe(TaskType.MAINTENANCE);
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.LAUNDRY_PICKUP,
        ),
      ).toBe(TaskType.LAUNDRY_PICKUP);
      expect(
        service.translateCategoryToWkmsTaskType(
          ActiveFossServiceCategory.OTHER,
        ),
      ).toBe(TaskType.OTHER);
    });

    it('rejects legacy WATER_BOTTLES and unknown categories with BadRequestException', () => {
      expect(() =>
        service.translateCategoryToWkmsTaskType(
          FossServiceCategory.WATER_BOTTLES,
        ),
      ).toThrow(BadRequestException);
      expect(() => service.translateCategoryToWkmsTaskType('UNKNOWN')).toThrow(
        BadRequestException,
      );
      expect(() =>
        service.translateCategoryToWkmsTaskType('LUGGAGE_ASSISTANCE'),
      ).toThrow(BadRequestException);
    });

    it('formats task description correctly by preserving guest notes', () => {
      expect(
        service.formatWkmsTaskDescription(ActiveFossServiceCategory.TOILETRIES),
      ).toBeUndefined();
      expect(
        service.formatWkmsTaskDescription(
          ActiveFossServiceCategory.TOILETRIES,
          '   ',
        ),
      ).toBeUndefined();
      expect(
        service.formatWkmsTaskDescription(
          ActiveFossServiceCategory.TOILETRIES,
          'Shampoo and toothbrush',
        ),
      ).toBe('Shampoo and toothbrush');
      expect(
        service.formatWkmsTaskDescription(
          ActiveFossServiceCategory.EXTRA_TOWELS,
          '2 bath towels',
        ),
      ).toBe('2 bath towels');
    });
  });

  describe('Additional Edge Cases & Branch Coverage (DDP-146)', () => {
    it('wraps generic Error from wkmsProvider.createTask in UpstreamServiceUnavailableException', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      jest
        .spyOn(mockWkms, 'createTask')
        .mockRejectedValueOnce(new Error('Socket timeout to WKMS'));

      await expect(
        service.createServiceRequest(sampleGuest, {
          requestType: FossServiceCategory.EXTRA_TOWELS,
          idempotencyKey: 'idemp-wkms-timeout',
        }),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('throws ForbiddenException when concurrent race condition duplicate key matches another room', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);

      const foreign = new FossServiceRequest();
      foreign.requestId = 'req-foreign';
      foreign.bookingId = 'booking-different';
      foreign.roomNumber = '999';
      foreign.category = FossServiceCategory.EXTRA_TOWELS;
      foreign.status = ServiceRequestStatus.SUBMITTED;
      foreign.priority = TaskPriority.NORMAL;
      foreign.idempotencyKey = 'idemp-shared-race';
      foreign.createdAt = new Date();
      foreign.updatedAt = new Date();

      mockRequestRepository.save.mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      });
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(foreign);

      await expect(
        service.createServiceRequest(sampleGuest, {
          requestType: FossServiceCategory.EXTRA_TOWELS,
          idempotencyKey: 'idemp-shared-race',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets estimatedCompletionMinutes to 0 when status transitioned to COMPLETED', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-to-complete';
      existing.taskId = 'task-wkms-comp';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.status = ServiceRequestStatus.IN_PROGRESS;
      existing.category = FossServiceCategory.ROOM_CLEANING;
      existing.priority = TaskPriority.NORMAL;
      existing.estimatedCompletionMinutes = 15;
      existing.createdAt = new Date();
      existing.updatedAt = new Date();

      mockRequestRepository.findByTaskId.mockResolvedValueOnce(existing);

      const result = await service.handleWkmsStatusEvent({
        eventId: '550e8400-e29b-41d4-a716-446655440050',
        taskId: 'task-wkms-comp',
        roomNumber: sampleGuest.roomNumber,
        status: ServiceRequestStatus.COMPLETED,
        occurredAt: new Date(Date.now() + 1000).toISOString(),
      });

      expect(result.processed).toBe(true);
      expect(result.request?.estimatedCompletionMinutes).toBe(0);
      expect(result.request?.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('discards out-of-order events when occurredAt is older than request updatedAt', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-stale';
      existing.taskId = 'task-wkms-stale';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.status = ServiceRequestStatus.IN_PROGRESS;
      existing.category = FossServiceCategory.ROOM_CLEANING;
      existing.priority = TaskPriority.NORMAL;
      existing.createdAt = new Date('2026-10-28T10:00:00Z');
      existing.updatedAt = new Date('2026-10-28T10:30:00Z');

      mockRequestRepository.findByTaskId.mockResolvedValueOnce(existing);

      const result = await service.handleWkmsStatusEvent({
        eventId: '550e8400-e29b-41d4-a716-446655440051',
        taskId: 'task-wkms-stale',
        roomNumber: sampleGuest.roomNumber,
        status: ServiceRequestStatus.ASSIGNED,
        occurredAt: '2026-10-28T10:15:00Z', // older than updatedAt
      });

      expect(result.processed).toBe(false);
      expect(result.message).toContain(
        'Stale event discarded without updating state.',
      );
    });

    it('handles race conditions on save with duplicate key and matching stay', async () => {
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      const existing = new FossServiceRequest();
      existing.requestId = 'req-race-match';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.status = ServiceRequestStatus.SUBMITTED;
      existing.category = FossServiceCategory.ROOM_CLEANING;
      existing.priority = TaskPriority.NORMAL;
      existing.createdAt = new Date();
      existing.updatedAt = new Date();

      mockRequestRepository.save.mockRejectedValueOnce({ code: '23505' });
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existing,
      );

      const res = await service.createServiceRequest(sampleGuest, validDto);
      expect(res.requestId).toBe('req-race-match');

      // duplicate key message
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockRequestRepository.save.mockRejectedValueOnce({
        message: 'duplicate key value violates',
      });
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existing,
      );

      const res2 = await service.createServiceRequest(sampleGuest, validDto);
      expect(res2.requestId).toBe('req-race-match');

      // UNIQUE constraint when findByIdempotencyKey is null -> throws
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockRequestRepository.save.mockRejectedValueOnce({
        message: 'UNIQUE constraint failed',
      });
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);

      await expect(
        service.createServiceRequest(sampleGuest, validDto),
      ).rejects.toEqual({
        message: 'UNIQUE constraint failed',
      });

      // generic error -> throws
      mockRequestRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockRequestRepository.save.mockRejectedValueOnce(
        new Error('Connection terminated'),
      );

      await expect(
        service.createServiceRequest(sampleGuest, validDto),
      ).rejects.toThrow('Connection terminated');
    });

    it('handles stale event when occurredAt is an invalid date string', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-invalid-date-event';
      existing.taskId = 'task-invalid-date';
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.status = ServiceRequestStatus.SUBMITTED;
      existing.category = FossServiceCategory.ROOM_CLEANING;
      existing.priority = TaskPriority.NORMAL;
      existing.createdAt = new Date();
      existing.updatedAt = new Date();

      mockRequestRepository.findByTaskId.mockResolvedValueOnce(existing);

      const result = await service.handleWkmsStatusEvent({
        eventId: '550e8400-e29b-41d4-a716-446655440052',
        taskId: 'task-invalid-date',
        roomNumber: sampleGuest.roomNumber,
        status: ServiceRequestStatus.ASSIGNED,
        occurredAt: 'invalid-date-string',
      });

      expect(result.processed).toBe(true);
      expect(result.request?.status).toBe(ServiceRequestStatus.ASSIGNED);
    });

    it('falls back gracefully in mapToResponse when dates are invalid or null and publicReference missing', async () => {
      const existing = new FossServiceRequest();
      existing.requestId = 'req-map-fallback';
      existing.publicReference = undefined as any;
      existing.bookingId = sampleGuest.bookingId;
      existing.roomNumber = sampleGuest.roomNumber;
      existing.status = ServiceRequestStatus.SUBMITTED;
      existing.category = FossServiceCategory.ROOM_CLEANING;
      existing.priority = TaskPriority.NORMAL;
      existing.createdAt = 'not-a-date' as any;
      existing.updatedAt = null as any;

      const res = (service as any).mapToResponse(existing);
      expect(res.requestId).toBe('req-map-fallback');
      expect(res.createdAt).toBeDefined();
      expect(res.updatedAt).toBeDefined();
    });
  });
});
