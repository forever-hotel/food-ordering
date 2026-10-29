import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TaskType } from '../../integrations/internal-services/wkms/dto/wkms-task.dto.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { AdvanceServiceRequestStatusDto } from './dto/advance-service-request-status.dto.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { ServiceRequestStatus } from './enums/service-request-status.enum.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';

describe('ServiceRequestsController', () => {
  let controller: ServiceRequestsController;
  let service: jest.Mocked<ServiceRequestsService>;

  const sampleGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: 'booking-uuid-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
  };

  const sampleResponse: ServiceRequestResponseDto = {
    requestId: 'req-101',
    roomNumber: '101',
    bookingId: 'booking-uuid-101',
    requestType: TaskType.EXTRA_TOWELS,
    description: 'Please bring 2 extra towels',
    status: ServiceRequestStatus.SUBMITTED,
    priority: 'NORMAL' as any,
    assignedStaff: null,
    estimatedCompletionMinutes: 20,
    taskId: 'task-101',
    idempotencyKey: 'idemp-sr-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [],
  };

  beforeEach(() => {
    service = {
      createServiceRequest: jest.fn().mockResolvedValue(sampleResponse),
      getGuestServiceRequests: jest.fn().mockResolvedValue([sampleResponse]),
      getGuestServiceRequestById: jest.fn().mockResolvedValue(sampleResponse),
      advanceServiceRequestStatus: jest.fn().mockResolvedValue({
        ...sampleResponse,
        status: ServiceRequestStatus.ASSIGNED,
      }),
    } as unknown as jest.Mocked<ServiceRequestsService>;

    controller = new ServiceRequestsController(service);
  });

  describe('createServiceRequest()', () => {
    it('delegates service request creation to ServiceRequestsService', async () => {
      const dto: CreateServiceRequestDto = {
        requestType: TaskType.EXTRA_TOWELS,
        description: 'Please bring 2 extra towels',
      };

      const result = await controller.createServiceRequest(
        sampleGuest,
        dto,
        'idemp-sr-001',
      );

      expect(result).toEqual(sampleResponse);
      expect(service.createServiceRequest).toHaveBeenCalledWith(
        sampleGuest,
        dto,
        'idemp-sr-001',
      );
    });
  });

  describe('getGuestServiceRequests()', () => {
    it('delegates fetching stay service requests to ServiceRequestsService', async () => {
      const result = await controller.getGuestServiceRequests(sampleGuest);

      expect(result).toEqual([sampleResponse]);
      expect(service.getGuestServiceRequests).toHaveBeenCalledWith(sampleGuest);
    });
  });

  describe('getGuestServiceRequestById()', () => {
    it('delegates fetching request by ID to ServiceRequestsService', async () => {
      const result = await controller.getGuestServiceRequestById(
        sampleGuest,
        'req-101',
      );

      expect(result).toEqual(sampleResponse);
      expect(service.getGuestServiceRequestById).toHaveBeenCalledWith(
        sampleGuest,
        'req-101',
      );
    });
  });

  describe('advanceServiceRequestStatus()', () => {
    it('delegates status advancement to ServiceRequestsService', async () => {
      const dto: AdvanceServiceRequestStatusDto = {
        status: ServiceRequestStatus.ASSIGNED,
        assignedStaff: 'Housekeeper #12',
      };

      const result = await controller.advanceServiceRequestStatus(
        sampleGuest,
        'req-101',
        dto,
      );

      expect(result.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(service.advanceServiceRequestStatus).toHaveBeenCalledWith(
        sampleGuest,
        'req-101',
        ServiceRequestStatus.ASSIGNED,
        'Housekeeper #12',
      );
    });
  });
});
