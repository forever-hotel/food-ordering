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
      findByBookingAndRoom: async (bookingId: string, roomNumber: string) => {
        return Array.from(inMemoryRequests.values()).filter(
          (r) => r.bookingId === bookingId && r.roomNumber === roomNumber,
        );
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
});
