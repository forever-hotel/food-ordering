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
      req1.bookingId = 'b-1';
      req1.roomNumber = '101';
      const req2 = new FossServiceRequest();
      req2.requestId = 'req-2';
      req2.bookingId = 'b-1';
      req2.roomNumber = '101';
      const req3 = new FossServiceRequest();
      req3.requestId = 'req-3';
      req3.bookingId = 'b-1';
      req3.roomNumber = '101';
      const req4 = new FossServiceRequest();
      req4.requestId = 'req-4';
      req4.bookingId = 'b-1';
      req4.roomNumber = '101';
      const req5 = new FossServiceRequest();
      req5.requestId = 'req-5';
      req5.bookingId = 'b-1';
      req5.roomNumber = '101';

      const mockQuery = jest
        .fn<any>()
        .mockImplementation(async (sql: string, _params: any[]) => {
          if (sql.includes('public.wkms_tasks')) {
            return [
              {
                service_request_id: 'req-1',
                task_id: 'task-1',
                booking_id: 'b-1',
                room_number: '101',
                status: 'COMPLETED',
                updated_at: '2026-10-31T19:00:00Z',
                completed_at: '2026-10-31T19:05:00Z',
                full_name: 'John Staff',
              },
              {
                service_request_id: 'req-2',
                task_id: 'task-2',
                booking_id: 'b-1',
                room_number: '101',
                status: 'IN_PROGRESS',
                updated_at: '2026-10-31T19:10:00Z',
                completed_at: null,
                full_name: null,
              },
              {
                service_request_id: 'req-3',
                task_id: 'task-3',
                booking_id: 'b-1',
                room_number: '101',
                status: 'ASSIGNED',
                updated_at: '2026-10-31T19:20:00Z',
                completed_at: null,
                full_name: 'Jane Staff',
              },
              {
                service_request_id: 'req-4',
                task_id: 'task-4',
                booking_id: 'b-1',
                room_number: '101',
                status: 'CREATED',
                updated_at: '2026-10-31T19:30:00Z',
                completed_at: null,
                full_name: null,
              },
            ];
          }
          if (sql.includes('public.audit_logs')) {
            return [
              {
                task_id: 'task-1',
                entity_id: 'task-1',
                action: 'TASK_CLAIMED',
                created_at: '2026-10-31T18:45:00Z',
              },
              {
                task_id: 'task-1',
                entity_id: 'task-1',
                action: 'TASK_STARTED',
                created_at: '2026-10-31T18:50:00Z',
              },
              {
                task_id: 'task-1',
                entity_id: 'task-1',
                action: 'TASK_COMPLETED',
                created_at: '2026-10-31T19:05:00Z',
              },
            ];
          }
          return [];
        });
      (typeormRepo as any).manager = { query: mockQuery };
      typeormRepo.find.mockResolvedValue([req1, req2, req3, req4, req5]);

      const results = await repository.findByBookingAndRoom('b-1', '101');
      expect(results[0].status).toBe(ServiceRequestStatus.COMPLETED);
      expect(results[0].assignedStaff).toBe('John Staff');
      expect(results[0].timelineTimestamps?.assignedAt?.toISOString()).toBe(
        '2026-10-31T18:45:00.000Z',
      );
      expect(results[0].timelineTimestamps?.inProgressAt?.toISOString()).toBe(
        '2026-10-31T18:50:00.000Z',
      );
      expect(results[0].timelineTimestamps?.completedAt?.toISOString()).toBe(
        '2026-10-31T19:05:00.000Z',
      );

      expect(results[1].status).toBe(ServiceRequestStatus.IN_PROGRESS);
      expect(results[1].assignedStaff).toBeNull();
      expect(results[2].status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(results[3].status).toBe(ServiceRequestStatus.SUBMITTED);
      // req5 had no task match
      expect(results[4].assignedStaff).toBeUndefined();
    });

    it('bypasses synchronization when SHARED_DATABASE_MODE is not true even if NODE_ENV is production', async () => {
      delete process.env.SHARED_DATABASE_MODE;
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = new FossServiceRequest();
      req.requestId = 'req-prod-no-shared';
      req.bookingId = 'b-1';
      req.roomNumber = '101';
      req.status = ServiceRequestStatus.SUBMITTED;

      const mockQuery = jest.fn<any>();
      (typeormRepo as any).manager = { query: mockQuery };
      typeormRepo.findOne.mockResolvedValue(req);

      const result = await repository.findById('req-prod-no-shared');
      expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
      expect(mockQuery).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });

    describe('Strict Positive Ownership Validation', () => {
      beforeEach(() => {
        process.env.SHARED_DATABASE_MODE = 'true';
      });

      it('rejects enrichment when WKMS booking_id does not match request bookingId', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-1';
        req.bookingId = 'b-guest';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-1',
            task_id: 'task-other-booking',
            booking_id: 'b-attacker',
            room_number: '101',
            status: 'IN_PROGRESS',
            full_name: 'Attacker Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-1');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when WKMS room_number does not match request roomNumber', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-2';
        req.bookingId = 'b-guest';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-2',
            task_id: 'task-diff-room',
            booking_id: 'b-guest',
            room_number: '999',
            status: 'IN_PROGRESS',
            full_name: 'Attacker Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-2');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when WKMS booking_id is null or empty', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-3';
        req.bookingId = 'b-guest';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-3',
            task_id: 'task-null-b',
            booking_id: null,
            room_number: '101',
            status: 'IN_PROGRESS',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-3');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when WKMS room_number is null or empty', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-4';
        req.bookingId = 'b-guest';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-4',
            task_id: 'task-null-r',
            booking_id: 'b-guest',
            room_number: null,
            status: 'IN_PROGRESS',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-4');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when request bookingId is missing', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-5';
        req.bookingId = '' as any;
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-5',
            task_id: 'task-5',
            booking_id: 'b-guest',
            room_number: '101',
            status: 'IN_PROGRESS',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-5');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when request roomNumber is missing', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-6';
        req.bookingId = 'b-guest';
        req.roomNumber = '' as any;
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-6',
            task_id: 'task-6',
            booking_id: 'b-guest',
            room_number: '101',
            status: 'IN_PROGRESS',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-6');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when valid taskId is associated with another booking in WKMS', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-7';
        req.taskId = 'task-foreign-booking';
        req.bookingId = 'b-legit';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: null,
            task_id: 'task-foreign-booking',
            booking_id: 'b-foreign',
            room_number: '101',
            status: 'COMPLETED',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-7');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });

      it('rejects enrichment when valid service_request_id is associated with another room in WKMS', async () => {
        const req = new FossServiceRequest();
        req.requestId = 'req-owner-8';
        req.bookingId = 'b-legit';
        req.roomNumber = '101';
        req.status = ServiceRequestStatus.SUBMITTED;

        const mockQuery = jest.fn<any>().mockResolvedValue([
          {
            service_request_id: 'req-owner-8',
            task_id: 'task-8',
            booking_id: 'b-legit',
            room_number: '102', // different room
            status: 'COMPLETED',
            full_name: 'Staff',
          },
        ]);
        (typeormRepo as any).manager = { query: mockQuery };
        typeormRepo.findOne.mockResolvedValue(req);

        const result = await repository.findById('req-owner-8');
        expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
        expect(result?.assignedStaff).toBeUndefined();
      });
    });

    it('prevents status regression when FOSS request is already COMPLETED', async () => {
      process.env.SHARED_DATABASE_MODE = 'true';
      const req = new FossServiceRequest();
      req.requestId = 'req-completed-stay';
      req.bookingId = 'b-1';
      req.roomNumber = '101';
      req.status = ServiceRequestStatus.COMPLETED;

      const mockQuery = jest.fn<any>().mockResolvedValue([
        {
          service_request_id: 'req-completed-stay',
          task_id: 'task-regress',
          booking_id: 'b-1',
          room_number: '101',
          status: 'ASSIGNED', // Stale/regressed status from WKMS
          full_name: 'Test Staff',
        },
      ]);
      (typeormRepo as any).manager = { query: mockQuery };
      typeormRepo.findOne.mockResolvedValue(req);

      const result = await repository.findById('req-completed-stay');
      expect(result?.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('gracefully handles query errors without throwing in withTaskState', async () => {
      process.env.SHARED_DATABASE_MODE = 'true';
      const req = new FossServiceRequest();
      req.requestId = 'req-err';
      req.bookingId = 'b-1';
      req.roomNumber = '101';
      req.status = ServiceRequestStatus.SUBMITTED;

      const mockQuery = jest
        .fn<any>()
        .mockRejectedValue(new Error('Connection failed'));
      (typeormRepo as any).manager = { query: mockQuery };
      typeormRepo.findOne.mockResolvedValue(req);

      const result = await repository.findById('req-err');
      expect(result?.status).toBe(ServiceRequestStatus.SUBMITTED);
    });
  });
});
