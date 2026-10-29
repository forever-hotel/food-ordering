import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ComplaintsController } from './complaints.controller.js';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintCategory } from './enums/complaint-category.enum.js';
import { ComplaintSeverity } from './enums/complaint-severity.enum.js';
import { ComplaintStatus } from './enums/complaint-status.enum.js';
import type { ComplaintResponseDto } from './dto/complaint-response.dto.js';
import type { CreateComplaintDto } from './dto/create-complaint.dto.js';
import type { GetComplaintsQueryDto } from './dto/get-complaints-query.dto.js';
import type { AdvanceComplaintStatusDto } from './dto/advance-complaint-status.dto.js';
import type { MadComplaintStatusUpdatedEventDto } from './dto/mad-status-event.dto.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';

describe('ComplaintsController', () => {
  let controller: ComplaintsController;
  let service: jest.Mocked<ComplaintsService>;

  const mockGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: '550e8400-e29b-41d4-a716-446655440000',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    role: 'GUEST',
  };

  const mockResponse: ComplaintResponseDto = {
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
    assignedManager: null,
    resolutionNotes: null,
    createdAt: '2026-10-29T20:00:00.000Z',
    updatedAt: '2026-10-29T20:00:00.000Z',
    timeline: [
      {
        status: ComplaintStatus.SUBMITTED,
        label: 'Complaint Submitted',
        completed: true,
        current: true,
        timestamp: '2026-10-29T20:00:00.000Z',
      },
      {
        status: ComplaintStatus.UNDER_INVESTIGATION,
        label: 'Under Investigation',
        completed: false,
        current: false,
      },
      {
        status: ComplaintStatus.RESOLVED,
        label: 'Resolved',
        completed: false,
        current: false,
      },
    ],
  };

  beforeEach(() => {
    service = {
      fileComplaint: (jest.fn() as any).mockResolvedValue(mockResponse),
      getComplaints: (jest.fn() as any).mockResolvedValue([mockResponse]),
      getComplaintById: (jest.fn() as any).mockResolvedValue(mockResponse),
      advanceComplaintStatus: (jest.fn() as any).mockResolvedValue({
        ...mockResponse,
        status: ComplaintStatus.UNDER_INVESTIGATION,
      }),
      handleMadStatusEvent: (jest.fn() as any).mockResolvedValue({
        processed: true,
        message: 'Status updated from MAD event.',
        complaint: mockResponse,
      }),
    } as unknown as jest.Mocked<ComplaintsService>;

    controller = new ComplaintsController(service);
  });

  it('delegates fileComplaint to service', async () => {
    const dto: CreateComplaintDto = {
      category: ComplaintCategory.FOOD,
      severity: ComplaintSeverity.MEDIUM,
      subject: 'Cold soup delivered',
      description: 'The mushroom soup was completely cold.',
      relatedOrderId: 'order-101-001',
    };

    const result = await controller.fileComplaint(
      mockGuest,
      dto,
      'idemp-header-123',
    );
    expect(service.fileComplaint).toHaveBeenCalledWith(
      mockGuest,
      dto,
      'idemp-header-123',
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates getComplaints to service with query filters', async () => {
    const query: GetComplaintsQueryDto = {
      status: ComplaintStatus.SUBMITTED,
      category: ComplaintCategory.FOOD,
      limit: 10,
      offset: 0,
    };

    const result = await controller.getComplaints(mockGuest, query);
    expect(service.getComplaints).toHaveBeenCalledWith(mockGuest, query);
    expect(result).toEqual([mockResponse]);
  });

  it('delegates getComplaintById to service', async () => {
    const result = await controller.getComplaintById(
      mockGuest,
      'CMP-20261029-A1B2C3',
    );
    expect(service.getComplaintById).toHaveBeenCalledWith(
      mockGuest,
      'CMP-20261029-A1B2C3',
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates advanceComplaintStatus to service', async () => {
    const dto: AdvanceComplaintStatusDto = {
      status: ComplaintStatus.UNDER_INVESTIGATION,
      assignedManager: 'Manager Sarah',
    };

    const result = await controller.advanceComplaintStatus(
      mockGuest,
      'CMP-20261029-A1B2C3',
      dto,
    );
    expect(service.advanceComplaintStatus).toHaveBeenCalledWith(
      mockGuest,
      'CMP-20261029-A1B2C3',
      dto,
    );
    expect(result.status).toBe(ComplaintStatus.UNDER_INVESTIGATION);
  });

  it('delegates handleMadStatusEvent to service', async () => {
    const event: MadComplaintStatusUpdatedEventDto = {
      eventId: 'd3b07384-d113-4623-8ffb-88a8d116a570',
      complaintId: 'CMP-20261029-A1B2C3',
      roomNumber: '101',
      status: ComplaintStatus.RESOLVED,
      assignedManager: 'Manager Sarah',
      resolutionNotes: 'Resolved with guest',
      occurredAt: '2026-10-29T21:00:00.000Z',
    };

    const result = await controller.handleMadStatusEvent(event);
    expect(service.handleMadStatusEvent).toHaveBeenCalledWith(event);
    expect(result.processed).toBe(true);
  });
});
