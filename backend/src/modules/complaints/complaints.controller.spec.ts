import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ComplaintsController } from './complaints.controller.js';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintCategory } from './enums/complaint-category.enum.js';
import { ComplaintSeverity } from './enums/complaint-severity.enum.js';
import { ComplaintStatus } from './enums/complaint-status.enum.js';
import type { ComplaintResponseDto } from './dto/complaint-response.dto.js';
import type { CreateComplaintDto } from './dto/create-complaint.dto.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';

describe('ComplaintsController', () => {
  let controller: ComplaintsController;
  let service: jest.Mocked<ComplaintsService>;

  const mockGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: '550e8400-e29b-41d4-a716-446655440000',
    roomNumber: '101',
    guestName: 'Jane Doe',
    stayStatus: 'CHECKED_IN',
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
  };

  beforeEach(() => {
    service = {
      fileComplaint: jest.fn<any>().mockResolvedValue(mockResponse),
      getComplaints: jest.fn<any>().mockResolvedValue([mockResponse]),
      getComplaintById: jest.fn<any>().mockResolvedValue(mockResponse),
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

  it('delegates getComplaints to service', async () => {
    const result = await controller.getComplaints(mockGuest);
    expect(service.getComplaints).toHaveBeenCalledWith(mockGuest);
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
});
