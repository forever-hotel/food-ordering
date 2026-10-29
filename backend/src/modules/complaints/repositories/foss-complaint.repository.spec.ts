import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { FossComplaint } from '../entities/foss-complaint.entity.js';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';
import { FossComplaintRepository } from './foss-complaint.repository.js';

describe('FossComplaintRepository', () => {
  let repository: FossComplaintRepository;
  let typeOrmRepo: jest.Mocked<Repository<FossComplaint>>;

  const mockComplaint: FossComplaint = {
    complaintId: 'CMP-20261029-A1B2C3',
    bookingId: '550e8400-e29b-41d4-a716-446655440000',
    roomNumber: '101',
    category: ComplaintCategory.FOOD,
    severity: ComplaintSeverity.MEDIUM,
    subject: 'Cold soup delivered',
    description: 'The mushroom soup was completely cold.',
    status: ComplaintStatus.SUBMITTED,
    relatedOrderId: 'order-101-001',
    relatedRequestId: null,
    assignedManager: null,
    resolutionNotes: null,
    idempotencyKey: 'idemp-cmp-001',
    createdAt: new Date('2026-10-29T20:00:00.000Z'),
    updatedAt: new Date('2026-10-29T20:00:00.000Z'),
  };

  beforeEach(() => {
    typeOrmRepo = {
      save: (jest.fn() as any).mockResolvedValue(mockComplaint),
      findOne: (jest.fn() as any).mockResolvedValue(mockComplaint),
      find: (jest.fn() as any).mockResolvedValue([mockComplaint]),
    } as unknown as jest.Mocked<Repository<FossComplaint>>;

    repository = new FossComplaintRepository(typeOrmRepo);
  });

  it('saves a complaint entity', async () => {
    const result = await repository.save(mockComplaint);
    expect(typeOrmRepo.save).toHaveBeenCalledWith(mockComplaint);
    expect(result).toEqual(mockComplaint);
  });

  it('finds a complaint by complaintId', async () => {
    const result = await repository.findById('CMP-20261029-A1B2C3');
    expect(typeOrmRepo.findOne).toHaveBeenCalledWith({
      where: { complaintId: 'CMP-20261029-A1B2C3' },
    });
    expect(result).toEqual(mockComplaint);
  });

  it('finds a complaint by idempotencyKey', async () => {
    const result = await repository.findByIdempotencyKey('idemp-cmp-001');
    expect(typeOrmRepo.findOne).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idemp-cmp-001' },
    });
    expect(result).toEqual(mockComplaint);
  });

  it('finds complaints by bookingId and roomNumber with optional status filter', async () => {
    const results = await repository.findByBookingAndRoom(
      '550e8400-e29b-41d4-a716-446655440000',
      '101',
      { status: ComplaintStatus.SUBMITTED, limit: 10, offset: 0 },
    );
    expect(typeOrmRepo.find).toHaveBeenCalledWith({
      where: {
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        roomNumber: '101',
        status: ComplaintStatus.SUBMITTED,
      },
      order: { createdAt: 'DESC' },
      take: 10,
      skip: 0,
    });
    expect(results).toEqual([mockComplaint]);
  });
});
