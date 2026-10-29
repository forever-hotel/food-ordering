import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { correlationMiddleware } from '../src/common/middleware/correlation.middleware.js';
import { InternalServiceGuard } from '../src/common/auth/internal-service.guard.js';
import { MockWkmsAdapter } from '../src/integrations/internal-services/wkms/adapters/mock-wkms.adapter.js';
import { WKMS_PROVIDER } from '../src/integrations/internal-services/wkms/interfaces/wkms-provider.interface.js';
import {
  TaskType,
  TaskPriority,
} from '../src/integrations/internal-services/wkms/dto/wkms-task.dto.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { ServiceRequestsController } from '../src/modules/service-requests/service-requests.controller.js';
import { ServiceRequestsService } from '../src/modules/service-requests/service-requests.service.js';
import { FossServiceRequest } from '../src/modules/service-requests/entities/foss-service-request.entity.js';
import { FossServiceRequestRepository } from '../src/modules/service-requests/repositories/foss-service-request.repository.js';
import { ServiceRequestStatus } from '../src/modules/service-requests/enums/service-request-status.enum.js';

describe('Service Requests & WKMS Worker Dispatch (e2e)', () => {
  let app: INestApplication;
  let mockWkms: MockWkmsAdapter;
  let inMemoryRequests: Map<string, FossServiceRequest>;
  let activeTokenRoom101: string;
  let activeTokenRoom102: string;

  beforeAll(async () => {
    mockWkms = new MockWkmsAdapter();
    inMemoryRequests = new Map<string, FossServiceRequest>();

    activeTokenRoom101 = 'token-valid-room-101';
    activeTokenRoom102 = 'token-valid-room-102';

    const mockGuestSessionsService = {
      validateSessionToken: async (token: string) => {
        if (token === activeTokenRoom101) {
          return {
            session: {
              sessionId: 'session-uuid-101',
              bookingId: 'booking-101',
              roomNumber: '101',
              isActive: true,
            },
            stay: {
              guestName: 'Jane Doe',
              stayStart: new Date(),
              stayEnd: new Date(Date.now() + 86400000),
            },
          };
        }
        if (token === activeTokenRoom102) {
          return {
            session: {
              sessionId: 'session-uuid-102',
              bookingId: 'booking-102',
              roomNumber: '102',
              isActive: true,
            },
            stay: {
              guestName: 'John Smith',
              stayStart: new Date(),
              stayEnd: new Date(Date.now() + 86400000),
            },
          };
        }
        throw new UnauthorizedException('Invalid or expired session token.');
      },
    };

    const mockRequestRepository = {
      findById: async (requestId: string) => {
        return inMemoryRequests.get(requestId) || null;
      },
      findByIdempotencyKey: async (idempotencyKey: string) => {
        for (const req of inMemoryRequests.values()) {
          if (req.idempotencyKey === idempotencyKey) {
            return req;
          }
        }
        return null;
      },
      findByTaskId: async (taskId: string) => {
        for (const req of inMemoryRequests.values()) {
          if (req.taskId === taskId) {
            return req;
          }
        }
        return null;
      },
      findByBookingAndRoom: async (
        bookingId: string,
        roomNumber: string,
        filters?: {
          status?: ServiceRequestStatus;
          requestType?: string;
          limit?: number;
          offset?: number;
        },
      ) => {
        let results = Array.from(inMemoryRequests.values()).filter(
          (r) => r.bookingId === bookingId && r.roomNumber === roomNumber,
        );
        if (filters?.status) {
          results = results.filter((r) => r.status === filters.status);
        }
        if (filters?.requestType) {
          results = results.filter(
            (r) => r.requestType === filters.requestType,
          );
        }
        const offset = filters?.offset ?? 0;
        const limit = filters?.limit ?? 50;
        return results.slice(offset, offset + limit);
      },
      save: async (req: FossServiceRequest) => {
        inMemoryRequests.set(req.requestId, req);
        return req;
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              DEMO_MODE: 'true',
            }),
          ],
        }),
      ],
      controllers: [ServiceRequestsController],
      providers: [
        ServiceRequestsService,
        GuestAuthGuard,
        InternalServiceGuard,
        {
          provide: FossServiceRequestRepository,
          useValue: mockRequestRepository,
        },
        {
          provide: WKMS_PROVIDER,
          useValue: mockWkms,
        },
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use(correlationMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('TC-DDP-131-AC1: Successful Creation, Room Binding & WKMS Dispatch', () => {
    it('creates service request, dispatches task to WKMS, and provides tracking timeline', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-sr-ac1-001')
        .send({
          requestType: TaskType.EXTRA_TOWELS,
          description: 'Please bring 2 large bath towels',
          priority: TaskPriority.NORMAL,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body.roomNumber).toBe('101');
      expect(response.body.bookingId).toBe('booking-101');
      expect(response.body.requestType).toBe(TaskType.EXTRA_TOWELS);
      expect(response.body.description).toBe(
        'Please bring 2 large bath towels',
      );
      expect(response.body.status).toBe(ServiceRequestStatus.SUBMITTED);
      expect(response.body.estimatedCompletionMinutes).toBe(20);
      expect(response.body.timeline).toHaveLength(4);
      expect(response.body.timeline[0].status).toBe(
        ServiceRequestStatus.SUBMITTED,
      );
      expect(response.body.timeline[0].current).toBe(true);

      const requestId = response.body.requestId;

      // Track request by ID
      const getResponse = await request(app.getHttpServer())
        .get(`/service-requests/${requestId}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.requestId).toBe(requestId);
      expect(getResponse.body.roomNumber).toBe('101');

      // Check current-stay history
      const historyResponse = await request(app.getHttpServer())
        .get('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(historyResponse.status).toBe(200);
      expect(Array.isArray(historyResponse.body)).toBe(true);
      expect(
        historyResponse.body.some((r: any) => r.requestId === requestId),
      ).toBe(true);
    });
  });

  describe('TC-DDP-131-AC2: Validation & Upstream Failure Handling', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests')
        .send({
          requestType: TaskType.EXTRA_TOWELS,
        });

      expect(response.status).toBe(401);
    });

    it('rejects invalid request category with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          requestType: 'INVALID_CATEGORY_CHOICE',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'requestType must be one of the approved categories',
          ),
        ]),
      );
    });

    it('rejects description exceeding 500 characters with 400 Bad Request', async () => {
      const longDescription = 'A'.repeat(501);

      const response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          requestType: TaskType.ROOM_CLEANING,
          description: longDescription,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('description cannot exceed 500 characters'),
        ]),
      );
    });

    it('fails closed with 503 error when upstream WKMS is unreachable', async () => {
      mockWkms.setSimulateDown(true);

      const response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-wkms-down-test')
        .send({
          requestType: TaskType.TOILETRIES,
          description: 'Need shampoo and soap',
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toContain('WKMS');

      mockWkms.setSimulateDown(false);
    });
  });

  describe('TC-DDP-131-AC3: Idempotency & Concurrency', () => {
    it('returns exact same request on duplicate submission with same idempotency key (idempotent replay)', async () => {
      const idempKey = 'idemp-sr-replay-101';

      const firstResponse = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', idempKey)
        .send({
          requestType: TaskType.MAINTENANCE,
          description: 'AC remote battery replacement',
        });

      expect(firstResponse.status).toBe(201);
      const requestId = firstResponse.body.requestId;

      // Duplicate submission
      const secondResponse = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', idempKey)
        .send({
          requestType: TaskType.MAINTENANCE,
          description: 'AC remote battery replacement',
        });

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.requestId).toBe(requestId);
    });

    it('rejects reuse of an idempotency key across different rooms with 403 Forbidden', async () => {
      const sharedKey = 'idemp-sr-cross-room-key';

      // Placed by Room 101
      const room101Response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          requestType: TaskType.EXTRA_TOWELS,
        });

      expect(room101Response.status).toBe(201);

      // Attempt reuse by Room 102
      const room102Response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom102}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          requestType: TaskType.EXTRA_TOWELS,
        });

      expect(room102Response.status).toBe(403);
      expect(room102Response.body.message).toContain(
        'different room or booking',
      );
    });
  });

  describe('TC-DDP-131-AC4: Status Progression Lifecycle & Cross-Room Security', () => {
    it('progresses status deterministically in DEMO_MODE through ASSIGNED, IN_PROGRESS, and COMPLETED', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-progression-test')
        .send({
          requestType: TaskType.LUGGAGE_ASSISTANCE,
          description: 'Need help with 2 suitcases',
        });

      expect(createResponse.status).toBe(201);
      const requestId = createResponse.body.requestId;

      // Step 1: Advance to ASSIGNED with worker
      const assignedResponse = await request(app.getHttpServer())
        .post(`/service-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          status: ServiceRequestStatus.ASSIGNED,
          assignedStaff: 'Porter Kamal #08',
        });

      expect(assignedResponse.status).toBe(200);
      expect(assignedResponse.body.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(assignedResponse.body.assignedStaff).toBe('Porter Kamal #08');

      // Step 2: Advance to IN_PROGRESS
      const inProgressResponse = await request(app.getHttpServer())
        .post(`/service-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          status: ServiceRequestStatus.IN_PROGRESS,
        });

      expect(inProgressResponse.status).toBe(200);
      expect(inProgressResponse.body.status).toBe(
        ServiceRequestStatus.IN_PROGRESS,
      );

      // Step 3: Advance to COMPLETED
      const completedResponse = await request(app.getHttpServer())
        .post(`/service-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          status: ServiceRequestStatus.COMPLETED,
        });

      expect(completedResponse.status).toBe(200);
      expect(completedResponse.body.status).toBe(
        ServiceRequestStatus.COMPLETED,
      );
      expect(completedResponse.body.estimatedCompletionMinutes).toBe(0);
      expect(completedResponse.body.timeline[3].completed).toBe(true);
      expect(completedResponse.body.timeline[3].current).toBe(true);
    });

    it('forbids Room 102 from reading a service request placed by Room 101 with 403 Forbidden', async () => {
      const room101Response = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-idor-protection')
        .send({
          requestType: TaskType.OTHER,
          description: 'Private guest note for room 101',
        });

      expect(room101Response.status).toBe(201);
      const requestId = room101Response.body.requestId;

      // Room 102 tries to read it
      const forbiddenRead = await request(app.getHttpServer())
        .get(`/service-requests/${requestId}`)
        .set('Authorization', `Bearer ${activeTokenRoom102}`);

      expect(forbiddenRead.status).toBe(403);
      expect(forbiddenRead.body.message).toContain('another room or booking');

      // Room 102 tries to advance its status
      const forbiddenStatus = await request(app.getHttpServer())
        .post(`/service-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom102}`)
        .send({
          status: ServiceRequestStatus.COMPLETED,
        });

      expect(forbiddenStatus.status).toBe(403);
    });
  });

  describe('TC-DDP-132-AC1: Filtered Request List & Webhook Status Convergence', () => {
    it('filters stay service requests by status and category, and tracks 4-stage progression timeline', async () => {
      // 1. Create two requests for Room 101
      const res1 = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-filter-101-a')
        .send({
          requestType: TaskType.EXTRA_TOWELS,
          description: 'Need 2 extra towels',
        });
      expect(res1.status).toBe(201);
      const reqId1 = res1.body.requestId;

      const res2 = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-filter-101-b')
        .send({
          requestType: TaskType.ROOM_CLEANING,
          description: 'Morning housekeeping please',
        });
      expect(res2.status).toBe(201);
      const reqId2 = res2.body.requestId;

      // 2. Converge status of req2 to ASSIGNED via signed internal WKMS webhook
      const webhookRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440020',
          requestId: reqId2,
          roomNumber: '101',
          status: ServiceRequestStatus.ASSIGNED,
          assignedStaff: 'Housekeeper Priya',
          occurredAt: new Date().toISOString(),
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.processed).toBe(true);
      expect(webhookRes.body.request.status).toBe(
        ServiceRequestStatus.ASSIGNED,
      );

      // 3. Query filtered list by status=ASSIGNED
      const filterStatusRes = await request(app.getHttpServer())
        .get('/service-requests?status=ASSIGNED')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(filterStatusRes.status).toBe(200);
      expect(filterStatusRes.body.length).toBeGreaterThanOrEqual(1);
      expect(
        filterStatusRes.body.every(
          (r: any) => r.status === ServiceRequestStatus.ASSIGNED,
        ),
      ).toBe(true);
      expect(
        filterStatusRes.body.some((r: any) => r.requestId === reqId2),
      ).toBe(true);

      // 4. Query filtered list by requestType=EXTRA_TOWELS
      const filterTypeRes = await request(app.getHttpServer())
        .get(`/service-requests?requestType=${TaskType.EXTRA_TOWELS}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(filterTypeRes.status).toBe(200);
      expect(
        filterTypeRes.body.every(
          (r: any) => r.requestType === TaskType.EXTRA_TOWELS,
        ),
      ).toBe(true);
      expect(filterTypeRes.body.some((r: any) => r.requestId === reqId1)).toBe(
        true,
      );

      // 5. Query detail and check 4-stage progression timeline
      const detailRes = await request(app.getHttpServer())
        .get(`/service-requests/${reqId2}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.status).toBe(ServiceRequestStatus.ASSIGNED);
      expect(detailRes.body.assignedStaff).toBe('Housekeeper Priya');
      expect(detailRes.body.timeline).toHaveLength(4);
      expect(detailRes.body.timeline[0].completed).toBe(true);
      expect(detailRes.body.timeline[1].completed).toBe(true);
      expect(detailRes.body.timeline[1].current).toBe(true);
      expect(detailRes.body.timeline[2].completed).toBe(false);
      expect(detailRes.body.timeline[3].completed).toBe(false);
    });
  });

  describe('TC-DDP-132-AC2: Negative / Error Handling - Unknown & Foreign Requests', () => {
    it('returns 404 Not Found for non-existent service request detail query', async () => {
      const response = await request(app.getHttpServer())
        .get('/service-requests/req-non-existent-999')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 Not Found when WKMS webhook references non-existent request', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440021',
          requestId: 'req-non-existent-999',
          roomNumber: '101',
          status: ServiceRequestStatus.ASSIGNED,
          occurredAt: new Date().toISOString(),
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('was not found');
    });

    it('returns 403 Forbidden when WKMS webhook room mismatches request room', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-ac2-room-mismatch')
        .send({
          requestType: TaskType.EXTRA_TOWELS,
        });
      const reqId = createRes.body.requestId;

      const webhookRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440022',
          requestId: reqId,
          roomNumber: '999', // Mismatched room!
          status: ServiceRequestStatus.ASSIGNED,
          occurredAt: new Date().toISOString(),
        });

      expect(webhookRes.status).toBe(403);
      expect(webhookRes.body.message).toContain('roomNumber does not match');
    });
  });

  describe('TC-DDP-132-AC3: Forward-only Lifecycle, Deduplication & Stale Replay Rejection', () => {
    it('rejects status regression with 409 ConflictException', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-ac3-regression-test')
        .send({
          requestType: TaskType.MAINTENANCE,
        });
      const reqId = createRes.body.requestId;

      // Advance to IN_PROGRESS
      await request(app.getHttpServer())
        .post(`/service-requests/${reqId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: ServiceRequestStatus.IN_PROGRESS });

      // Attempt to regress back to SUBMITTED
      const regressionRes = await request(app.getHttpServer())
        .post(`/service-requests/${reqId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: ServiceRequestStatus.SUBMITTED });

      expect(regressionRes.status).toBe(409);
      expect(regressionRes.body.message).toContain('Illegal status regression');
    });

    it('deduplicates duplicate eventId idempotently without rolling back or reprocessing', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-ac3-dedup-test')
        .send({
          requestType: TaskType.TOILETRIES,
        });
      const reqId = createRes.body.requestId;

      const eventPayload = {
        eventId: '770e8400-e29b-41d4-a716-446655440023',
        requestId: reqId,
        roomNumber: '101',
        status: ServiceRequestStatus.ASSIGNED,
        assignedStaff: 'Staff Sunil',
        occurredAt: new Date().toISOString(),
      };

      // First delivery
      const firstRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send(eventPayload);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.processed).toBe(true);

      // Replayed duplicate event
      const secondRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send(eventPayload);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.processed).toBe(true);
      expect(secondRes.body.message).toContain('already processed');
    });

    it('discards stale events and out-of-order regressions without modifying current state', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-ac3-stale-test')
        .send({
          requestType: TaskType.ROOM_CLEANING,
        });
      const reqId = createRes.body.requestId;

      // Advance to COMPLETED
      await request(app.getHttpServer())
        .post(`/service-requests/${reqId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: ServiceRequestStatus.COMPLETED });

      // 1. Send stale event (timestamp in past)
      const staleRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440024',
          requestId: reqId,
          roomNumber: '101',
          status: ServiceRequestStatus.COMPLETED,
          occurredAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        });

      expect(staleRes.status).toBe(200);
      expect(staleRes.body.processed).toBe(false);
      expect(staleRes.body.message).toContain('Stale event discarded');

      // 2. Send out-of-order regression event (status: IN_PROGRESS when entity is COMPLETED)
      const regressionRes = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'fds-internal-secret-demo')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440025',
          requestId: reqId,
          roomNumber: '101',
          status: ServiceRequestStatus.IN_PROGRESS,
          occurredAt: new Date().toISOString(),
        });

      expect(regressionRes.status).toBe(200);
      expect(regressionRes.body.processed).toBe(false);
      expect(regressionRes.body.message).toContain('Out-of-order');

      // Verify request state is still COMPLETED
      const checkRes = await request(app.getHttpServer())
        .get(`/service-requests/${reqId}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.status).toBe(ServiceRequestStatus.COMPLETED);
    });
  });

  describe('TC-DDP-132-AC4: Internal Webhook Authentication Guard', () => {
    it('rejects unauthenticated webhook calls with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440026',
          requestId: 'req-any',
          roomNumber: '101',
          status: ServiceRequestStatus.ASSIGNED,
          occurredAt: new Date().toISOString(),
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('credential is required');
    });

    it('rejects webhook calls with invalid service key with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/service-requests/internal/events/status-updated')
        .set('x-internal-service-key', 'wrong-invalid-secret')
        .send({
          eventId: '770e8400-e29b-41d4-a716-446655440027',
          requestId: 'req-any',
          roomNumber: '101',
          status: ServiceRequestStatus.ASSIGNED,
          occurredAt: new Date().toISOString(),
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain(
        'Invalid internal service credential',
      );
    });
  });
});
