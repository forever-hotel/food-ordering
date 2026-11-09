import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { FossServiceRequest } from '../entities/foss-service-request.entity.js';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';
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

  it('finds a request by public reference (non-UUID)', async () => {
    const entity = new FossServiceRequest();
    entity.requestId = 'req-101';
    typeormRepo.findOne.mockResolvedValue(entity);

    const result = await repository.findById('req-101');
    expect(result).toBe(entity);
    expect(typeormRepo.findOne).toHaveBeenCalledWith({
      where: { publicReference: 'req-101' },
    });
  });

  it('finds a request by canonical UUID', async () => {
    const entity = new FossServiceRequest();
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    entity.requestId = validUuid;
    typeormRepo.findOne.mockResolvedValue(entity);

    const result = await repository.findById(validUuid);
    expect(result).toBe(entity);
    expect(typeormRepo.findOne).toHaveBeenCalledWith({
      where: [{ requestId: validUuid }, { publicReference: validUuid }],
    });
  });

  it('returns null for empty or invalid requestId types', async () => {
    expect(await repository.findById('')).toBeNull();
    expect(await repository.findById('   ')).toBeNull();
    expect(await repository.findById(null as any)).toBeNull();
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
      status: ServiceRequestStatus.SUBMITTED,
      requestType: 'EXTRA_TOWELS',
      limit: 10,
      offset: 5,
    });
    expect(result).toEqual([entity]);
    expect(typeormRepo.find).toHaveBeenCalledWith({
      where: {
        bookingId: 'booking-101',
        roomNumber: '101',
        status: ServiceRequestStatus.SUBMITTED,
        category: 'EXTRA_TOWELS',
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

  it('finds a request by task ID', async () => {
    const entity = new FossServiceRequest();
    entity.taskId = 'task-456';
    typeormRepo.findOne.mockResolvedValue(entity);

    const result = await repository.findByTaskId('task-456');
    expect(result).toBe(entity);
    expect(typeormRepo.findOne).toHaveBeenCalledWith({
      where: { taskId: 'task-456' },
    });
  });

  describe('SHARED_DATABASE_MODE handling', () => {
    const originalEnv = process.env.SHARED_DATABASE_MODE;

    afterEach(() => {
      process.env.SHARED_DATABASE_MODE = originalEnv;
    });

    it('sets completedAt when saving with SHARED_DATABASE_MODE=true and status is COMPLETED', async () => {
      process.env.SHARED_DATABASE_MODE = 'true';
      const entity = new FossServiceRequest();
      entity.requestId = 'req-c-1';
      entity.status = ServiceRequestStatus.COMPLETED;
      entity.updatedAt = new Date('2026-10-31T18:00:00Z');
      typeormRepo.save.mockImplementation(async (e: any) => e);

      const result = await repository.save(entity);
      expect(result.completedAt).toEqual(entity.updatedAt);
    });

    it('sets completedAt to null when saving with SHARED_DATABASE_MODE=true and status is not COMPLETED', async () => {
      process.env.SHARED_DATABASE_MODE = 'true';
      const entity = new FossServiceRequest();
      entity.requestId = 'req-c-2';
      entity.status = ServiceRequestStatus.IN_PROGRESS;
      entity.completedAt = new Date('2026-10-31T17:00:00Z');
      typeormRepo.save.mockImplementation(async (e: any) => e);

      const result = await repository.save(entity);
      expect(result.completedAt).toBeNull();
    });

    it('enriches requests with task state in SHARED_DATABASE_MODE', async () => {
      process.env.SHARED_DATABASE_MODE = 'true';
      const req1 = new FossServiceRequest();
      req1.requestId = 'req-1';
      const req2 = new FossServiceRequest();
      req2.requestId = 'req-2';
      const req3 = new FossServiceRequest();
      req3.requestId = 'req-3';
      const req4 = new FossServiceRequest();
      req4.requestId = 'req-4';
      const req5 = new FossServiceRequest();
      req5.requestId = 'req-5';

      const mockQuery = jest.fn<any>().mockResolvedValue([
        {
          service_request_id: 'req-1',
          status: 'COMPLETED',
          updated_at: '2026-10-31T19:00:00Z',
          full_name: 'John Staff',
        },
        {
          service_request_id: 'req-2',
          status: 'IN_PROGRESS',
          updated_at: '2026-10-31T19:10:00Z',
          full_name: null,
        },
        {
          service_request_id: 'req-3',
          status: 'ASSIGNED',
          updated_at: '2026-10-31T19:20:00Z',
          full_name: 'Jane Staff',
        },
        {
          service_request_id: 'req-4',
          status: 'CREATED',
          updated_at: '2026-10-31T19:30:00Z',
          full_name: null,
        },
      ]);
      (typeormRepo as any).manager = { query: mockQuery };
      typeormRepo.find.mockResolvedValue([req1, req2, req3, req4, req5]);

      const results = await repository.findByBookingAndRoom('b-1', '101');
      expect(results[0].status).toBe(ServiceRequestStatus.COMPLETED);
      expect(results[0].assignedStaff).toBe('John Staff');
      expect(results[1].status).toBe(ServiceRequestStatus.IN_PROGRESS);
      expect(results[1].assignedStaff).toBeNull();
      expect(results[2].status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(results[3].status).toBe(ServiceRequestStatus.SUBMITTED);
      // req5 had no task match
      expect(results[4].assignedStaff).toBeUndefined();
    });
  });
});
