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

describe('Food Orders Atomicity, Idempotency & 10-Minute Cancellation (e2e)', () => {
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

  describe('TC-DDP-129: Core Order Placement, Atomicity & Idempotency', () => {
    it('TC-DDP-129-AC1: places food order atomically with authoritative pricing, room scope, and ETA', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-flow-ac1-001')
        .send({
          items: [
            {
              menuItemId: 'menu-item-001', // Truffle Mushroom Arancini (18.00)
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
      expect(response.body.canCancel).toBe(true);

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

    it('TC-DDP-129-AC2: rejects unauthenticated requests with 401 Unauthorized', async () => {
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

    it('TC-DDP-129-AC2: rejects missing idempotency key with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Idempotency key is required');
    });

    it('TC-DDP-129-AC2: rejects non-existent menu item with 400 Bad Request', async () => {
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

    it('TC-DDP-129-AC2: rejects sold-out item with 409 Conflict', async () => {
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

    it('TC-DDP-129-AC2: rejects order for meal window that has passed cutoff with 400 Bad Request', async () => {
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

    it('TC-DDP-129-AC2: rejects invalid quantity (< 1 or > 20) with 400 Bad Request', async () => {
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

    it('TC-DDP-129-AC2: fails closed with 503 error when upstream KMS is unreachable', async () => {
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

    it('TC-DDP-129-AC3: returns exact same order on duplicate submission with same idempotency key', async () => {
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

    it('TC-DDP-129-AC3: rejects reuse of an idempotency key across different rooms with 403 Forbidden', async () => {
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

    it('TC-DDP-129-AC3: calculates total with decimal-safe money rounding', async () => {
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

    it('TC-DDP-129-AC4: forbids room 102 from reading an order placed by room 101', async () => {
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

  describe('TC-DDP-130: Order Tracking, Stay History & 10-Minute Cancellation', () => {
    it('TC-DDP-130-AC1: cancels eligible submitted order within 10 minutes and updates timeline', async () => {
      // Place new order
      const placeResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-cancel-test-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          allergyNote: 'Vegetarian',
        });

      expect(placeResponse.status).toBe(201);
      const orderId = placeResponse.body.orderId;
      expect(placeResponse.body.canCancel).toBe(true);
      expect(placeResponse.body.timeline).toHaveLength(4);

      // Cancel the order within 10 minutes
      const cancelResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ reason: 'Guest changed mind' });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.status).toBe('CANCELLED');
      expect(cancelResponse.body.canCancel).toBe(false);
      expect(cancelResponse.body.secondsRemainingToCancel).toBe(0);

      // Verify tracking reflection
      const trackResponse = await request(app.getHttpServer())
        .get(`/food-orders/${orderId}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(trackResponse.status).toBe(200);
      expect(trackResponse.body.status).toBe('CANCELLED');
      expect(trackResponse.body.timeline).toBeDefined();
      expect(
        trackResponse.body.timeline?.some((t: any) => t.status === 'CANCELLED'),
      ).toBe(true);
    });

    it('TC-DDP-130-AC2: rejects cancellation when 10-minute window has expired with 409 Conflict', async () => {
      // Place order at 13:00 Colombo (07:30 UTC)
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const placeResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-cancel-expired-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      expect(placeResponse.status).toBe(201);
      const orderId = placeResponse.body.orderId;

      // Advance clock 11 minutes forward (13:11 Colombo = 07:41 UTC)
      clockService.setFixedTime(new Date('2026-10-28T07:41:00.000Z'));

      const cancelResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ reason: 'Late cancellation attempt' });

      expect(cancelResponse.status).toBe(409);
      expect(cancelResponse.body.message).toContain(
        'Cancellation window has expired',
      );
    });

    it('TC-DDP-130-AC2: rejects cancellation when kitchen preparation has already begun with 409 Conflict', async () => {
      // Reset clock to 13:00
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const placeResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-prep-cancel-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      const orderId = placeResponse.body.orderId;

      // Advance status to IN_PREPARATION via demo endpoint
      const advanceResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: 'IN_PREPARATION' });

      expect(advanceResponse.status).toBe(200);
      expect(advanceResponse.body.status).toBe('IN_PREPARATION');

      // Attempt to cancel while in preparation (within 2 minutes)
      clockService.setFixedTime(new Date('2026-10-28T07:32:00.000Z'));

      const cancelResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ reason: 'Cancel while preparing' });

      expect(cancelResponse.status).toBe(409);
      expect(cancelResponse.body.message).toContain(
        'kitchen preparation has already begun',
      );
    });

    it('TC-DDP-130-AC3: precision boundary test (9m59s allowed vs 10m00s cutoff)', async () => {
      // Placed at 07:30:00 UTC
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const orderValidResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-boundary-9m59s')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      const validOrderId = orderValidResponse.body.orderId;

      // At exactly 9 minutes 59 seconds (07:39:59 UTC = 599s)
      clockService.setFixedTime(new Date('2026-10-28T07:39:59.000Z'));

      const cancelValid = await request(app.getHttpServer())
        .post(`/food-orders/${validOrderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(cancelValid.status).toBe(200);
      expect(cancelValid.body.status).toBe('CANCELLED');

      // Placed at 07:30:00 UTC
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const orderCutoffResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-boundary-10m00s')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      const cutoffOrderId = orderCutoffResponse.body.orderId;

      // At exactly 10 minutes 00 seconds (07:40:00 UTC = 600s)
      clockService.setFixedTime(new Date('2026-10-28T07:40:00.000Z'));

      const cancelCutoff = await request(app.getHttpServer())
        .post(`/food-orders/${cutoffOrderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(cancelCutoff.status).toBe(409);
      expect(cancelCutoff.body.message).toContain(
        'Cancellation window has expired',
      );
    });

    it('TC-DDP-130-AC4: status progression lifecycle in DEMO_MODE updates ETA and timeline', async () => {
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const placeResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-timeline-progression-001')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      const orderId = placeResponse.body.orderId;

      // 1. Advance to READY (ETA should be 5 mins)
      const readyResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: 'READY' });

      expect(readyResponse.status).toBe(200);
      expect(readyResponse.body.status).toBe('READY');
      expect(readyResponse.body.estimatedDeliveryMinutes).toBe(5);

      // 2. Advance to DELIVERED (ETA should be 0 mins)
      const deliveredResponse = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/status`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .send({ status: 'DELIVERED' });

      expect(deliveredResponse.status).toBe(200);
      expect(deliveredResponse.body.status).toBe('DELIVERED');
      expect(deliveredResponse.body.estimatedDeliveryMinutes).toBe(0);
      expect(deliveredResponse.body.canCancel).toBe(false);

      const readyStep = deliveredResponse.body.timeline?.find(
        (t: any) => t.status === 'READY',
      );
      const deliveredStep = deliveredResponse.body.timeline?.find(
        (t: any) => t.status === 'DELIVERED',
      );

      expect(readyStep?.completed).toBe(true);
      expect(deliveredStep?.current).toBe(true);
    });

    it('TC-DDP-130-AC4: forbids Room 102 from cancelling Room 101 order', async () => {
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const placeResponse = await request(app.getHttpServer())
        .post('/food-orders')
        .set('Authorization', `Bearer ${activeTokenRoom101}`)
        .set('Idempotency-Key', 'idemp-room-isolation-cancel')
        .send({
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        });

      const orderId = placeResponse.body.orderId;

      // Room 102 tries to cancel
      const unauthorizedCancel = await request(app.getHttpServer())
        .post(`/food-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${activeTokenRoom102}`);

      expect(unauthorizedCancel.status).toBe(403);
      expect(unauthorizedCancel.body.message).toContain(
        'permission to cancel orders from another room',
      );
    });
  });
});
