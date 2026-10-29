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
import { MockMadComplaintAdapter } from '../src/integrations/internal-services/mad/adapters/mock-mad-complaint.adapter.js';
import { MAD_COMPLAINT_PROVIDER } from '../src/integrations/internal-services/mad/interfaces/mad-complaint-provider.interface.js';
import { ComplaintsController } from '../src/modules/complaints/complaints.controller.js';
import { ComplaintsService } from '../src/modules/complaints/complaints.service.js';
import { FossComplaint } from '../src/modules/complaints/entities/foss-complaint.entity.js';
import { ComplaintCategory } from '../src/modules/complaints/enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../src/modules/complaints/enums/complaint-severity.enum.js';
import { ComplaintStatus } from '../src/modules/complaints/enums/complaint-status.enum.js';
import { FossComplaintRepository } from '../src/modules/complaints/repositories/foss-complaint.repository.js';
import { FossDemoOrder } from '../src/modules/food-orders/entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from '../src/modules/food-orders/repositories/foss-demo-order.repository.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { FossServiceRequest } from '../src/modules/service-requests/entities/foss-service-request.entity.js';
import { FossServiceRequestRepository } from '../src/modules/service-requests/repositories/foss-service-request.repository.js';

describe('Guest Complaints Management (e2e)', () => {
  let app: INestApplication;
  let mockMad: MockMadComplaintAdapter;
  let inMemoryComplaints: Map<string, FossComplaint>;

  const activeTokenRoom101 = 'token-valid-room-101';
  const activeTokenRoom102 = 'token-valid-room-102';

  beforeAll(async () => {
    mockMad = new MockMadComplaintAdapter();
    inMemoryComplaints = new Map<string, FossComplaint>();

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
        throw new UnauthorizedException('Invalid or expired guest session.');
      },
    };

    const mockComplaintRepository = {
      save: async (complaint: FossComplaint) => {
        const toSave = { ...complaint };
        if (!toSave.createdAt) toSave.createdAt = new Date();
        toSave.updatedAt = new Date();
        inMemoryComplaints.set(toSave.complaintId, toSave);
        return toSave;
      },
      findById: async (id: string) => inMemoryComplaints.get(id) ?? null,
      findByIdempotencyKey: async (key: string) => {
        for (const c of inMemoryComplaints.values()) {
          if (c.idempotencyKey === key) return c;
        }
        return null;
      },
      findByBookingAndRoom: async (bookingId: string, roomNumber: string) => {
        const results: FossComplaint[] = [];
        for (const c of inMemoryComplaints.values()) {
          if (c.bookingId === bookingId && c.roomNumber === roomNumber) {
            results.push(c);
          }
        }
        return results;
      },
    };

    const mockOrderRepository = {
      findById: async (orderId: string) => {
        if (orderId === 'order-room-101') {
          return {
            orderId: 'order-room-101',
            bookingId: 'booking-101',
            roomNumber: '101',
          } as FossDemoOrder;
        }
        if (orderId === 'order-room-102') {
          return {
            orderId: 'order-room-102',
            bookingId: 'booking-102',
            roomNumber: '102',
          } as FossDemoOrder;
        }
        return null;
      },
    };

    const mockServiceRequestRepository = {
      findById: async (requestId: string) => {
        if (requestId === 'req-room-101') {
          return {
            requestId: 'req-room-101',
            bookingId: 'booking-101',
            roomNumber: '101',
          } as FossServiceRequest;
        }
        if (requestId === 'req-room-102') {
          return {
            requestId: 'req-room-102',
            bookingId: 'booking-102',
            roomNumber: '102',
          } as FossServiceRequest;
        }
        return null;
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
      controllers: [ComplaintsController],
      providers: [
        ComplaintsService,
        GuestAuthGuard,
        {
          provide: FossComplaintRepository,
          useValue: mockComplaintRepository,
        },
        {
          provide: FossDemoOrderRepository,
          useValue: mockOrderRepository,
        },
        {
          provide: FossServiceRequestRepository,
          useValue: mockServiceRequestRepository,
        },
        {
          provide: MAD_COMPLAINT_PROVIDER,
          useValue: mockMad,
        },
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(correlationMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('TC-DDP-133-AC1: Successful Workflow - Create Complaint with Category, Severity, and References', () => {
    let createdComplaintId: string;

    it('creates a complaint with valid category, severity, subject, description and stay-scoped order reference', async () => {
      const response = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          category: ComplaintCategory.FOOD,
          severity: ComplaintSeverity.MEDIUM,
          subject: 'Cold soup delivered',
          description: 'The mushroom soup was completely cold upon arrival.',
          relatedOrderId: 'order-room-101',
          relatedRequestId: 'req-room-101',
        })
        .expect(201);

      expect(response.body).toHaveProperty('complaintId');
      expect(response.body.complaintId).toMatch(/^CMP-\d{8}-[A-F0-9]{6}$/);
      expect(response.body.bookingId).toBe('booking-101');
      expect(response.body.roomNumber).toBe('101');
      expect(response.body.category).toBe(ComplaintCategory.FOOD);
      expect(response.body.severity).toBe(ComplaintSeverity.MEDIUM);
      expect(response.body.status).toBe(ComplaintStatus.SUBMITTED);
      expect(response.body.relatedOrderId).toBe('order-room-101');
      expect(response.body.relatedRequestId).toBe('req-room-101');

      createdComplaintId = response.body.complaintId;
    });

    it('retrieves the created complaint by ID for the current guest stay', async () => {
      const response = await request(app.getHttpServer())
        .get(`/complaints/${createdComplaintId}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .expect(200);

      expect(response.body.complaintId).toBe(createdComplaintId);
      expect(response.body.subject).toBe('Cold soup delivered');
    });

    it('lists all complaints filed for the active guest stay', async () => {
      const response = await request(app.getHttpServer())
        .get('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].roomNumber).toBe('101');
    });
  });

  describe('TC-DDP-133-AC2: Negative / Error Cases - Validation & Cross-Room Ownership', () => {
    it('rejects complaint creation with invalid severity with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          category: ComplaintCategory.SERVICE,
          severity: 'SUPER_URGENT',
          subject: 'Valid subject line',
          description: 'Valid description that is long enough.',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'severity must be one of the following values',
          ),
        ]),
      );
    });

    it('rejects complaint creation with description shorter than 10 characters with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          category: ComplaintCategory.NOISE,
          severity: ComplaintSeverity.LOW,
          subject: 'Noisy hall',
          description: 'Too short',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'description must be longer than or equal to 10 characters',
          ),
        ]),
      );
    });

    it('rejects complaint referencing food order belonging to a different room with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          category: ComplaintCategory.FOOD,
          severity: ComplaintSeverity.MEDIUM,
          subject: 'Foreign order test',
          description: 'Attempting to reference Room 102 food order.',
          relatedOrderId: 'order-room-102',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'Referenced food order [order-room-102] does not belong to the current guest stay.',
      );
    });

    it('rejects complaint referencing service request belonging to a different room with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          category: ComplaintCategory.SERVICE,
          severity: ComplaintSeverity.MEDIUM,
          subject: 'Foreign request test',
          description: 'Attempting to reference Room 102 service request.',
          relatedRequestId: 'req-room-102',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'Referenced service request [req-room-102] does not belong to the current guest stay.',
      );
    });

    it('rejects complaint retrieval when requested by a different guest room with 404 Not Found', async () => {
      // Room 101 filed complaint, Room 102 attempts to fetch it
      const firstComplaint = inMemoryComplaints.values().next().value;
      expect(firstComplaint).toBeDefined();

      await request(app.getHttpServer())
        .get(`/complaints/${firstComplaint!.complaintId}`)
        .set('Authorization', `Bearer ${activeTokenRoom102}`)
        .expect(404);
    });

    it('rejects unauthenticated complaint creation with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/complaints')
        .send({
          category: ComplaintCategory.OTHER,
          severity: ComplaintSeverity.LOW,
          subject: 'Unauthorized test',
          description: 'Testing unauthenticated access rejection.',
        })
        .expect(401);
    });
  });

  describe('TC-DDP-133-AC3: Boundary, Concurrency & Idempotency', () => {
    it('returns the same complaint without duplicate creation when idempotency key is replayed', async () => {
      const idempotencyKey = 'idemp-replay-test-001';

      const firstResponse = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('x-idempotency-key', idempotencyKey)
        .send({
          category: ComplaintCategory.CLEANLINESS,
          severity: ComplaintSeverity.HIGH,
          subject: 'Dusty curtains reported',
          description:
            'The curtains in the room have extensive dust accumulated.',
        })
        .expect(201);

      const secondResponse = await request(app.getHttpServer())
        .post('/complaints')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('x-idempotency-key', idempotencyKey)
        .send({
          category: ComplaintCategory.CLEANLINESS,
          severity: ComplaintSeverity.HIGH,
          subject: 'Dusty curtains reported',
          description:
            'The curtains in the room have extensive dust accumulated.',
        })
        .expect(201);

      expect(secondResponse.body.complaintId).toBe(
        firstResponse.body.complaintId,
      );
    });

    it('ensures concurrent submissions generate distinct collision-free references', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/complaints')
          .set('Authorization', `Bearer ${activeTokenRoom101}`)
          .send({
            category: ComplaintCategory.AMENITY,
            severity: ComplaintSeverity.LOW,
            subject: `Amenity item missing #${i}`,
            description: `Toothbrush kit is missing from the bathroom shelf #${i}.`,
          }),
      );

      const responses = await Promise.all(requests);
      const complaintIds = responses.map((r) => r.body.complaintId);
      const uniqueIds = new Set(complaintIds);

      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('TC-DDP-133-AC4: Contract Compliance & MAD Resilience', () => {
    it('persists complaint safely in Neon even when MAD upstream is simulated down', async () => {
      mockMad.setSimulateDown(true);

      try {
        const response = await request(app.getHttpServer())
          .post('/complaints')
          .set('Authorization', `Bearer ${activeTokenRoom101}`)
          .send({
            category: ComplaintCategory.NOISE,
            severity: ComplaintSeverity.URGENT,
            subject: 'Loud construction noise',
            description:
              'Excessive construction noise in the hallway at night.',
          })
          .expect(201);

        expect(response.body.status).toBe(ComplaintStatus.SUBMITTED);
        expect(response.body.complaintId).toMatch(/^CMP-/);

        // Verify complaint is preserved in memory repository
        const saved = inMemoryComplaints.get(response.body.complaintId);
        expect(saved).toBeDefined();
        expect(saved!.subject).toBe('Loud construction noise');
      } finally {
        mockMad.setSimulateDown(false);
      }
    });
  });
});
