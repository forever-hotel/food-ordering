import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import { MadComplaintProvider } from '../../integrations/internal-services/mad/interfaces/mad-complaint-provider.interface.js';
import { RealtimeEventType } from '../../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { FossDemoOrderRepository } from '../food-orders/repositories/foss-demo-order.repository.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { FossServiceRequestRepository } from '../service-requests/repositories/foss-service-request.repository.js';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintCategory } from './enums/complaint-category.enum.js';
import { ComplaintSeverity } from './enums/complaint-severity.enum.js';
import { ComplaintStatus } from './enums/complaint-status.enum.js';
import { FossComplaint } from './entities/foss-complaint.entity.js';
import { FossComplaintRepository } from './repositories/foss-complaint.repository.js';

describe('ComplaintsService', () => {
  let service: ComplaintsService;
  let complaintRepo: jest.Mocked<FossComplaintRepository>;
  let madProvider: jest.Mocked<MadComplaintProvider>;
  let orderRepo: jest.Mocked<FossDemoOrderRepository>;
  let serviceRequestRepo: jest.Mocked<FossServiceRequestRepository>;
  let configService: jest.Mocked<ConfigService>;
  let realtimeService: jest.Mocked<RealtimeService>;

  const mockGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: '550e8400-e29b-41d4-a716-446655440000',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'John Smith',
    role: 'GUEST',
  };

  const existingComplaint: FossComplaint = {
    complaintId: 'CMP-20261029-A1B2C3',
    bookingId: mockGuest.bookingId,
    roomNumber: mockGuest.roomNumber,
    category: ComplaintCategory.FOOD,
    severity: ComplaintSeverity.MEDIUM,
    subject: 'Cold soup delivered',
    description: 'The mushroom soup was completely cold.',
    status: ComplaintStatus.SUBMITTED,
    relatedOrderId: 'order-101-001',
    relatedRequestId: null,
    assignedManager: 'Manager Sarah',
    resolutionNotes: null,
    idempotencyKey: 'idemp-existing-001',
    createdAt: new Date('2026-10-29T20:00:00.000Z'),
    updatedAt: new Date('2026-10-29T20:00:00.000Z'),
  };

  beforeEach(() => {
    complaintRepo = {
      save: (jest.fn() as any).mockImplementation((c: FossComplaint) =>
        Promise.resolve(c),
      ),
      findById: (jest.fn() as any).mockResolvedValue(null),
      findByIdempotencyKey: (jest.fn() as any).mockResolvedValue(null),
      findByBookingAndRoom: (jest.fn() as any).mockResolvedValue([
        existingComplaint,
      ]),
    } as unknown as jest.Mocked<FossComplaintRepository>;

    madProvider = {
      fileComplaint: (jest.fn() as any).mockResolvedValue({
        complaintId: 'CMP-20261029-A1B2C3',
        roomNumber: '101',
        bookingId: mockGuest.bookingId,
        category: ComplaintCategory.FOOD,
        severity: ComplaintSeverity.MEDIUM,
        subject: 'Cold soup delivered',
        description: 'The mushroom soup was completely cold.',
        status: ComplaintStatus.SUBMITTED,
        assignedManager: 'Manager Sarah',
        resolutionNotes: null,
        createdAt: '2026-10-29T20:00:00.000Z',
        updatedAt: '2026-10-29T20:00:00.000Z',
        version: '1.0',
      }),
      getComplaint: jest.fn() as any,
      resolveComplaint: jest.fn() as any,
    } as unknown as jest.Mocked<MadComplaintProvider>;

    orderRepo = {
      findById: (jest.fn() as any).mockResolvedValue({
        orderId: 'order-101-001',
        bookingId: mockGuest.bookingId,
        roomNumber: mockGuest.roomNumber,
      }),
    } as unknown as jest.Mocked<FossDemoOrderRepository>;

    serviceRequestRepo = {
      findById: (jest.fn() as any).mockResolvedValue({
        requestId: 'req-101-001',
        bookingId: mockGuest.bookingId,
        roomNumber: mockGuest.roomNumber,
      }),
    } as unknown as jest.Mocked<FossServiceRequestRepository>;

    configService = {
      get: (jest.fn() as any).mockReturnValue('true'),
    } as unknown as jest.Mocked<ConfigService>;

    realtimeService = {
      emitToStay: jest.fn() as any,
    } as unknown as jest.Mocked<RealtimeService>;

    service = new ComplaintsService(
      complaintRepo,
      madProvider,
      orderRepo,
      serviceRequestRepo,
      configService,
      realtimeService,
    );
  });

  describe('fileComplaint', () => {
    it('creates a complaint successfully and emits real-time event', async () => {
      const result = await service.fileComplaint(mockGuest, {
        category: ComplaintCategory.FOOD,
        severity: ComplaintSeverity.HIGH,
        subject: 'Spoiled dessert <b>delivered</b>',
        description:
          'Dessert smelled foul, credit card 4111 1111 1111 1111 should be refunded.',
        relatedOrderId: 'order-101-001',
        relatedRequestId: 'req-101-001',
      });

      expect(complaintRepo.save).toHaveBeenCalledTimes(1);
      const saved = (complaintRepo.save as any).mock.calls[0][0];
      expect(saved.complaintId).toMatch(/^CMP-\d{8}-[A-F0-9]{6}$/);
      expect(saved.subject).toBe('Spoiled dessert delivered');
      expect(saved.description).toContain('[REDACTED_CARD]');
      expect(saved.assignedManager).toBe('Manager Sarah');
      expect(saved.bookingId).toBe(mockGuest.bookingId);
      expect(saved.roomNumber).toBe('101');

      expect(realtimeService.emitToStay).toHaveBeenCalledWith(
        mockGuest.bookingId,
        mockGuest.roomNumber,
        RealtimeEventType.COMPLAINT_STATUS_UPDATED,
        expect.objectContaining({
          complaintId: saved.complaintId,
          subject: 'Spoiled dessert delivered',
        }),
      );

      expect(result.complaintId).toBe(saved.complaintId);
    });

    it('returns existing complaint when duplicate idempotency key is replayed', async () => {
      (complaintRepo.findByIdempotencyKey as any).mockResolvedValueOnce(
        existingComplaint,
      );

      const result = await service.fileComplaint(
        mockGuest,
        {
          category: ComplaintCategory.FOOD,
          severity: ComplaintSeverity.MEDIUM,
          subject: 'Cold soup delivered',
          description: 'The mushroom soup was completely cold.',
        },
        'idemp-existing-001',
      );

      expect(complaintRepo.save).not.toHaveBeenCalled();
      expect(madProvider.fileComplaint).not.toHaveBeenCalled();
      expect(result.complaintId).toBe(existingComplaint.complaintId);
    });

    it('rejects complaint referencing foreign food order belonging to another room', async () => {
      (orderRepo.findById as any).mockResolvedValueOnce({
        orderId: 'order-foreign-999',
        bookingId: 'foreign-booking-uuid',
        roomNumber: '999',
      });

      await expect(
        service.fileComplaint(mockGuest, {
          category: ComplaintCategory.FOOD,
          severity: ComplaintSeverity.LOW,
          subject: 'Foreign order test',
          description: 'Testing cross-room isolation for orders.',
          relatedOrderId: 'order-foreign-999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects complaint referencing non-existent food order', async () => {
      (orderRepo.findById as any).mockResolvedValueOnce(null);

      await expect(
        service.fileComplaint(mockGuest, {
          category: ComplaintCategory.FOOD,
          severity: ComplaintSeverity.LOW,
          subject: 'Missing order reference test',
          description: 'Testing missing order reference.',
          relatedOrderId: 'order-missing-404',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects complaint referencing foreign service request belonging to another room', async () => {
      (serviceRequestRepo.findById as any).mockResolvedValueOnce({
        requestId: 'req-foreign-999',
        bookingId: 'foreign-booking-uuid',
        roomNumber: '999',
      });

      await expect(
        service.fileComplaint(mockGuest, {
          category: ComplaintCategory.SERVICE,
          severity: ComplaintSeverity.MEDIUM,
          subject: 'Foreign request reference test',
          description: 'Testing cross-room isolation for service requests.',
          relatedRequestId: 'req-foreign-999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists complaint safely in Neon even when MAD upstream is unavailable', async () => {
      (madProvider.fileComplaint as any).mockRejectedValueOnce(
        new UpstreamServiceUnavailableException(
          'MAD',
          'MAD triage gateway is unreachable.',
        ),
      );

      const result = await service.fileComplaint(mockGuest, {
        category: ComplaintCategory.CLEANLINESS,
        severity: ComplaintSeverity.URGENT,
        subject: 'Bathroom leak detected',
        description: 'Water leaking under the bathroom vanity.',
      });

      expect(complaintRepo.save).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(ComplaintStatus.SUBMITTED);
      expect(result.assignedManager).toBeNull();
      expect(result.resolutionNotes).toBeNull();
      expect(result.complaintId).toMatch(/^CMP-/);
    });
  });

  describe('getComplaintById', () => {
    it('returns complaint when owned by guest stay with complete timeline', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce(existingComplaint);

      const result = await service.getComplaintById(
        mockGuest,
        'CMP-20261029-A1B2C3',
      );
      expect(result.complaintId).toBe(existingComplaint.complaintId);
      expect(result.timeline).toBeDefined();
      expect(result.timeline.length).toBeGreaterThanOrEqual(3);
      expect(result.timeline[0].status).toBe(ComplaintStatus.SUBMITTED);
      expect(result.timeline[0].current).toBe(true);
      expect(result.timeline[0].completed).toBe(true);
    });

    it('builds timeline correctly for ESCALATED status', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.ESCALATED,
      });

      const result = await service.getComplaintById(
        mockGuest,
        'CMP-20261029-A1B2C3',
      );
      expect(result.status).toBe(ComplaintStatus.ESCALATED);
      const escalatedStep = result.timeline.find(
        (t) => t.status === ComplaintStatus.ESCALATED,
      );
      expect(escalatedStep).toBeDefined();
      expect(escalatedStep?.current).toBe(true);
      expect(escalatedStep?.completed).toBe(true);
    });

    it('throws NotFoundException when complaint does not exist', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce(null);

      await expect(
        service.getComplaintById(mockGuest, 'CMP-UNKNOWN'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when complaint belongs to another room', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        roomNumber: '102',
      });

      await expect(
        service.getComplaintById(mockGuest, 'CMP-20261029-A1B2C3'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getComplaints', () => {
    it('returns all complaints for current stay without filters', async () => {
      const results = await service.getComplaints(mockGuest);
      expect(complaintRepo.findByBookingAndRoom).toHaveBeenCalledWith(
        mockGuest.bookingId,
        mockGuest.roomNumber,
        undefined,
      );
      expect(results).toHaveLength(1);
      expect(results[0].complaintId).toBe(existingComplaint.complaintId);
    });

    it('passes query filters to repository findByBookingAndRoom', async () => {
      const query = {
        status: ComplaintStatus.SUBMITTED,
        category: ComplaintCategory.FOOD,
        severity: ComplaintSeverity.MEDIUM,
        limit: 10,
        offset: 5,
      };

      await service.getComplaints(mockGuest, query);
      expect(complaintRepo.findByBookingAndRoom).toHaveBeenCalledWith(
        mockGuest.bookingId,
        mockGuest.roomNumber,
        query,
      );
    });
  });

  describe('advanceComplaintStatus', () => {
    it('advances complaint status successfully and emits real-time event', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.SUBMITTED,
      });

      const result = await service.advanceComplaintStatus(
        mockGuest,
        existingComplaint.complaintId,
        {
          status: ComplaintStatus.UNDER_INVESTIGATION,
          assignedManager: 'Duty Manager Alan',
          resolutionNotes: 'Inspection scheduled',
        },
      );

      expect(complaintRepo.save).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(ComplaintStatus.UNDER_INVESTIGATION);
      expect(result.assignedManager).toBe('Duty Manager Alan');
      expect(result.resolutionNotes).toBe('Inspection scheduled');
      expect(realtimeService.emitToStay).toHaveBeenCalledWith(
        mockGuest.bookingId,
        mockGuest.roomNumber,
        RealtimeEventType.COMPLAINT_STATUS_UPDATED,
        expect.objectContaining({
          status: ComplaintStatus.UNDER_INVESTIGATION,
        }),
      );
    });

    it('rejects status advancement with ForbiddenException when DEMO_MODE is not true', async () => {
      (configService.get as any).mockReturnValueOnce('false');

      await expect(
        service.advanceComplaintStatus(
          mockGuest,
          existingComplaint.complaintId,
          {
            status: ComplaintStatus.UNDER_INVESTIGATION,
          },
        ),
      ).rejects.toThrow(
        'Demo status advancement is only permitted when DEMO_MODE is enabled.',
      );
    });

    it('rejects regression from RESOLVED to SUBMITTED', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.RESOLVED,
      });

      await expect(
        service.advanceComplaintStatus(
          mockGuest,
          existingComplaint.complaintId,
          {
            status: ComplaintStatus.SUBMITTED,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when complaint does not exist', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce(null);

      await expect(
        service.advanceComplaintStatus(mockGuest, 'NON-EXISTENT', {
          status: ComplaintStatus.UNDER_INVESTIGATION,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when complaint belongs to another room', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        roomNumber: '999',
      });

      await expect(
        service.advanceComplaintStatus(
          mockGuest,
          existingComplaint.complaintId,
          {
            status: ComplaintStatus.UNDER_INVESTIGATION,
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleMadStatusEvent', () => {
    const validEvent = {
      eventId: '990e8400-e29b-41d4-a716-446655440001',
      complaintId: existingComplaint.complaintId,
      roomNumber: '101',
      status: ComplaintStatus.UNDER_INVESTIGATION,
      assignedManager: 'Manager Michael',
      resolutionNotes: 'Under review by housekeeping',
      occurredAt: '2026-10-29T21:00:00.000Z',
    };

    it('applies status update from MAD event and emits realtime update', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.SUBMITTED,
        updatedAt: new Date('2026-10-29T20:00:00.000Z'),
      });

      const res = await service.handleMadStatusEvent(validEvent);

      expect(res.processed).toBe(true);
      expect(res.complaint?.status).toBe(ComplaintStatus.UNDER_INVESTIGATION);
      expect(complaintRepo.save).toHaveBeenCalledTimes(1);
      expect(realtimeService.emitToStay).toHaveBeenCalledWith(
        mockGuest.bookingId,
        mockGuest.roomNumber,
        RealtimeEventType.COMPLAINT_STATUS_UPDATED,
        expect.objectContaining({
          status: ComplaintStatus.UNDER_INVESTIGATION,
        }),
        validEvent.eventId,
      );
    });

    it('deduplicates duplicate event ID without persisting twice', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.SUBMITTED,
      });

      // First run processes
      await service.handleMadStatusEvent(validEvent);

      // Second run with same eventId returns duplicate
      const duplicateRes = await service.handleMadStatusEvent(validEvent);

      expect(duplicateRes.processed).toBe(true);
      expect(duplicateRes.duplicate).toBe(true);
      expect(complaintRepo.save).toHaveBeenCalledTimes(1); // not called again
    });

    it('throws NotFoundException if target complaint does not exist', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce(null);

      await expect(
        service.handleMadStatusEvent({
          ...validEvent,
          eventId: '990e8400-e29b-41d4-a716-446655440099',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if event roomNumber does not match complaint room', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        roomNumber: '101',
      });

      await expect(
        service.handleMadStatusEvent({
          ...validEvent,
          eventId: '990e8400-e29b-41d4-a716-446655440098',
          roomNumber: '102',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('discards stale MAD event older than resolved complaint updatedAt', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.RESOLVED,
        updatedAt: new Date('2026-10-29T22:00:00.000Z'),
      });

      const res = await service.handleMadStatusEvent({
        ...validEvent,
        eventId: '990e8400-e29b-41d4-a716-446655440097',
        occurredAt: '2026-10-29T19:00:00.000Z', // older
      });

      expect(res.processed).toBe(false);
      expect(res.message).toContain('Stale MAD event discarded');
      expect(complaintRepo.save).not.toHaveBeenCalled();
    });

    it('discards out-of-order event attempting to regress RESOLVED to SUBMITTED', async () => {
      (complaintRepo.findById as any).mockResolvedValueOnce({
        ...existingComplaint,
        status: ComplaintStatus.RESOLVED,
        updatedAt: new Date('2026-10-29T20:00:00.000Z'),
      });

      const res = await service.handleMadStatusEvent({
        ...validEvent,
        eventId: '990e8400-e29b-41d4-a716-446655440096',
        status: ComplaintStatus.SUBMITTED,
        occurredAt: '2026-10-29T21:00:00.000Z',
      });

      expect(res.processed).toBe(false);
      expect(res.message).toContain('Out-of-order MAD event discarded');
      expect(complaintRepo.save).not.toHaveBeenCalled();
    });
  });
});
