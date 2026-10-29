import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
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
    roomNumber: '101',
    guestName: 'Jane Doe',
  };

  const validDto: CreateServiceRequestDto = {
    requestType: TaskType.EXTRA_TOWELS,
    description: 'Please bring 2 extra towels',
    priority: TaskPriority.NORMAL,
    idempotencyKey: 'idemp-test-sr-001',
  };

  beforeEach(() => {
    mockRequestRepository = {
      save: jest.fn().mockImplementation(async (entity) => entity),
      findById: jest.fn(),
      findByTaskId: jest.fn(),
      findByBookingAndRoom: jest.fn(),
      findByIdempotencyKey: jest.fn(),
    } as unknown as jest.Mocked<FossServiceRequestRepository>;

    mockWkms = new MockWkmsAdapter();

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
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
      mockRequestRepository.findByTaskId = jest
        .fn()
        .mockResolvedValue(null) as any;

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
});
