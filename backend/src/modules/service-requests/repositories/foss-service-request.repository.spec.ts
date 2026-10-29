import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { FossServiceRequest } from '../entities/foss-service-request.entity.js';
import { FossServiceRequestRepository } from './foss-service-request.repository.js';

describe('FossServiceRequestRepository', () => {
  let repository: FossServiceRequestRepository;
  let typeormRepo: jest.Mocked<Repository<FossServiceRequest>>;

  beforeEach(() => {
    typeormRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<FossServiceRequest>>;

    repository = new FossServiceRequestRepository(typeormRepo);
  });

  it('saves a service request entity', async () => {
    const entity = new FossServiceRequest();
    entity.requestId = 'req-101';
    typeormRepo.save.mockResolvedValue(entity);

    const result = await repository.save(entity);
    expect(result).toBe(entity);
    expect(typeormRepo.save).toHaveBeenCalledWith(entity);
  });

  it('finds a request by ID', async () => {
    const entity = new FossServiceRequest();
    entity.requestId = 'req-101';
    typeormRepo.findOne.mockResolvedValue(entity);

    const result = await repository.findById('req-101');
    expect(result).toBe(entity);
    expect(typeormRepo.findOne).toHaveBeenCalledWith({
      where: { requestId: 'req-101' },
    });
  });

  it('finds requests by booking ID and room number ordered by createdAt DESC', async () => {
    const entity = new FossServiceRequest();
    entity.requestId = 'req-101';
    typeormRepo.find.mockResolvedValue([entity]);

    const result = await repository.findByBookingAndRoom('booking-101', '101');
    expect(result).toEqual([entity]);
    expect(typeormRepo.find).toHaveBeenCalledWith({
      where: { bookingId: 'booking-101', roomNumber: '101' },
      order: { createdAt: 'DESC' },
      take: 50,
      skip: 0,
    });
  });

  it('finds requests with status, category filters and pagination', async () => {
    const entity = new FossServiceRequest();
    entity.requestId = 'req-102';
    typeormRepo.find.mockResolvedValue([entity]);

    const result = await repository.findByBookingAndRoom('booking-101', '101', {
      status: 'SUBMITTED' as any,
      requestType: 'EXTRA_TOWELS',
      limit: 10,
      offset: 5,
    });
    expect(result).toEqual([entity]);
    expect(typeormRepo.find).toHaveBeenCalledWith({
      where: {
        bookingId: 'booking-101',
        roomNumber: '101',
        status: 'SUBMITTED',
        requestType: 'EXTRA_TOWELS',
      },
      order: { createdAt: 'DESC' },
      take: 10,
      skip: 5,
    });
  });

  it('finds a request by idempotency key', async () => {
    const entity = new FossServiceRequest();
    entity.idempotencyKey = 'key-123';
    typeormRepo.findOne.mockResolvedValue(entity);

    const result = await repository.findByIdempotencyKey('key-123');
    expect(result).toBe(entity);
    expect(typeormRepo.findOne).toHaveBeenCalledWith({
      where: { idempotencyKey: 'key-123' },
    });
  });
});
