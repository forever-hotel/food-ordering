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
import { MockKmsAdapter } from '../src/integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { KMS_PROVIDER } from '../src/integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { FoodOrdersController } from '../src/modules/food-orders/food-orders.controller.js';
import { FoodOrdersService } from '../src/modules/food-orders/food-orders.service.js';
import { FossDemoOrder } from '../src/modules/food-orders/entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from '../src/modules/food-orders/repositories/foss-demo-order.repository.js';
import { HotelClockService } from '../src/modules/menu/services/hotel-clock.service.js';
import { MealWindowService } from '../src/modules/menu/services/meal-window.service.js';

describe('Food Orders Atomicity & Idempotency (e2e)', () => {
  let app: INestApplication;
  let mockKms: MockKmsAdapter;
  let clockService: HotelClockService;
  let inMemoryOrders: Map<string, FossDemoOrder>;
  let activeTokenRoom101: string;
  let activeTokenRoom102: string;

  beforeAll(async () => {
    mockKms = new MockKmsAdapter();
    clockService = new HotelClockService();

    // Set operational clock to 13:00 Colombo (Lunch & All Day active)
    clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

    inMemoryOrders = new Map<string, FossDemoOrder>();

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

    const mockOrderRepository = {
      findById: async (orderId: string) => {
        return inMemoryOrders.get(orderId) || null;
      },
      findByIdempotencyKey: async (idempotencyKey: string) => {
        for (const order of inMemoryOrders.values()) {
          if (order.idempotencyKey === idempotencyKey) {
            return order;
          }
        }
        return null;
      },
      findByBookingAndRoom: async (bookingId: string, roomNumber: string) => {
        return Array.from(inMemoryOrders.values()).filter(
          (o) => o.bookingId === bookingId && o.roomNumber === roomNumber,
        );
      },
      save: async (order: FossDemoOrder) => {
        inMemoryOrders.set(order.orderId, order);
        return order;
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ DEMO_MODE: 'true', MOCK_EXTERNAL_SERVICES: 'true' })],
        }),
      ],
      controllers: [FoodOrdersController],
      providers: [
        FoodOrdersService,
        MealWindowService,
        {
          provide: HotelClockService,
          useValue: clockService,
        },
        {
          provide: KMS_PROVIDER,
          useValue: mockKms,
        },
        {
          provide: FossDemoOrderRepository,
          useValue: mockOrderRepository,
        },
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
        GuestAuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(correlationMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TC-DDP-129-AC1: Successful Order Placement Workflow (Final Design Fig 34 & 35)', () => {
    it('places food order atomically with authoritative pricing, room scope, and ETA', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-flow-ac1-001')
        .send({
          items: [
            {
              menuItemId: 'menu-item-001', // Truffle Mushroom Arancini (14.50)
              quantity: 2,
              specialNotes: 'Extra crispy',
            },
          ],
          allergyNote: 'No peanuts please',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('orderId');
      expect(response.body.roomNumber).toBe('101');
      expect(response.body.bookingId).toBe('booking-101');
      expect(response.body.status).toBe('PLACED');
      expect(response.body.totalAmount).toBe(36.0); // 18.00 * 2
      expect(response.body.estimatedDeliveryMinutes).toBe(25);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].name).toBe('Truffle Mushroom Arancini');
      expect(response.body.items[0].unitPrice).toBe(18.0);
      expect(response.body.items[0].quantity).toBe(2);
      expect(response.body.allergyNotes).toBe('No peanuts please');
      expect(response.body.idempotencyKey).toBe('idemp-flow-ac1-001');

      // Verify order can be retrieved by ID
      const orderId = response.body.orderId;
      const getResponse = await request(app.getHttpServer())
        .get(`/food-orders/${orderId}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.orderId).toBe(orderId);
      expect(getResponse.body.totalAmount).toBe(36.0);

      // Verify order appears in stay order history list
      const listResponse = await request(app.getHttpServer())
        .get('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body).toBeInstanceOf(Array);
      expect(listResponse.body.some((o: any) => o.orderId === orderId)).toBe(
        true,
      );
    });
  });

  describe('TC-DDP-129-AC2: Negative / Error Cases & Fail-Closed Protection', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          idempotencyKey: 'key-no-auth',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain(
        'Authorization header with Bearer token is required',
      );
    });

    it('rejects missing idempotency key with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Idempotency key is required');
    });

    it('rejects non-existent menu item with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-bad-item-001')
        .send({
          items: [{ menuItemId: 'invalid-item-uuid', quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'does not exist in the menu catalog',
      );
    });

    it('rejects sold-out item with 409 Conflict', async () => {
      // menu-item-007 (Seasonal Lobster Tail) is fixture available: false
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-sold-out-001')
        .send({
          items: [{ menuItemId: 'menu-item-007', quantity: 1 }],
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain(
        'currently unavailable (sold out)',
      );
    });

    it('rejects order for meal window that has passed cutoff with 400 Bad Request', async () => {
      // At 13:00 Colombo, Breakfast cutoff (10:30:00) has passed
      // menu-item-004 is Classic Eggs Benedict (BREAKFAST)
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-breakfast-cutoff')
        .send({
          items: [{ menuItemId: 'menu-item-004', quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('cutoff has passed');
    });

    it('rejects invalid quantity (< 1 or > 20) with 400 Bad Request', async () => {
      const responseUnder = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-qty-under')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 0 }],
        });

      expect(responseUnder.status).toBe(400);

      const responseOver = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-qty-over')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 21 }],
        });

      expect(responseOver.status).toBe(400);
    });

    it('fails closed with 503 error when upstream KMS is unreachable', async () => {
      mockKms.setSimulateDown(true);

      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-kms-down-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      mockKms.setSimulateDown(false);

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Upstream Service Unavailable');
    });
  });

  describe('TC-DDP-129-AC3: Boundary, Concurrency & Idempotency', () => {
    it('returns exact same order on duplicate submission with same idempotency key', async () => {
      const idempotencyKey = 'idemp-duplicate-test-999';

      const firstResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          allergyNote: 'Gluten free please',
        });

      expect(firstResponse.status).toBe(201);
      const firstOrderId = firstResponse.body.orderId;

      const secondResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.orderId).toBe(firstOrderId);
      expect(secondResponse.body.totalAmount).toBe(
        firstResponse.body.totalAmount,
      );
    });

    it('rejects reuse of an idempotency key across different rooms with 403 Forbidden', async () => {
      const sharedKey = 'idemp-cross-room-attempt';

      const room101Response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(room101Response.status).toBe(201);

      // Room 102 attempts to use the same idempotency key
      const room102Response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom102}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(room102Response.status).toBe(403);
      expect(room102Response.body.message).toContain(
        'different room or booking',
      );
    });

    it('calculates total with decimal-safe money rounding', async () => {
      // 3 items of 18.00 = 54.00
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-money-rounding-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 3 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.totalAmount).toBe(54.0);
    });
  });

  describe('TC-DDP-129-AC4: Cross-Room Security & Isolation', () => {
    it('forbids room 102 from reading an order placed by room 101', async () => {
      const orderResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-isolation-test-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(orderResponse.status).toBe(201);
      const room101OrderId = orderResponse.body.orderId;

      // Room 102 tries to read room 101's order
      const readAttempt = await request(app.getHttpServer())
        .get(`/food-orders/${room101OrderId}`)
        .set('Authorization', `Bearer ${activeTokenRoom102}`);

      expect(readAttempt.status).toBe(403);
      expect(readAttempt.body.message).toContain(
        'permission to view orders from another room',
      );
    });
  });
});
