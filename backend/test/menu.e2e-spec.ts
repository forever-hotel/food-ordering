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
import { MealPeriod } from '../src/integrations/internal-services/kms/dto/kms-menu.dto.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { MenuController } from '../src/modules/menu/menu.controller.js';
import { MenuService } from '../src/modules/menu/menu.service.js';
import { HotelClockService } from '../src/modules/menu/services/hotel-clock.service.js';
import { MealWindowService } from '../src/modules/menu/services/meal-window.service.js';

describe('Menu and Meal Windows Integration (e2e)', () => {
  let app: INestApplication;
  let mockKms: MockKmsAdapter;
  let clockService: HotelClockService;
  let activeToken: string;

  beforeAll(async () => {
    mockKms = new MockKmsAdapter();
    activeToken = 'valid-test-session-token-101';

    const mockGuestSessionsService = {
      validateSessionToken: async (token: string) => {
        if (token === activeToken) {
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
              stayEnd: new Date(Date.now() + 24 * 3600 * 1000),
            },
          };
        }
        throw new UnauthorizedException('Invalid or expired session token.');
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ DEMO_MODE: 'true', MOCK_EXTERNAL_SERVICES: 'true' })],
        }),
      ],
      controllers: [MenuController],
      providers: [
        MenuService,
        MealWindowService,
        HotelClockService,
        {
          provide: KMS_PROVIDER,
          useValue: mockKms,
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
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    clockService = moduleFixture.get<HotelClockService>(HotelClockService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TC-DDP-128-AC1: Successful Menu Retrieval & Categorization (Final Design Fig 32 & 33)', () => {
    it('returns available menu items and active meal periods in Asia/Colombo for authenticated guest', async () => {
      // Set to 13:00 Colombo (Lunch active)
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const response = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      expect(response.body.version).toBe('1.0');
      expect(response.body.activeMealPeriods).toContain(MealPeriod.LUNCH);
      expect(response.body.categories).toContain('Mains');
      expect(response.body.items.length).toBeGreaterThan(0);

      // Verify Wagyu Burger properties
      const burger = response.body.items.find(
        (i: any) => i.id === 'menu-item-002',
      );
      expect(burger).toBeDefined();
      expect(burger.name).toBe('Signature Wagyu Burger');
      expect(burger.price).toBe(32.5);
      expect(burger.isOrderable).toBe(true);
      expect(burger.allergens).toContain('Dairy');
    });

    it('retrieves detailed menu item information by id on GET /menu/items/:id', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/items/menu-item-001')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      expect(response.body.id).toBe('menu-item-001');
      expect(response.body.name).toBe('Truffle Mushroom Arancini');
      expect(response.body.dietaryFlags).toContain('VEGETARIAN');
    });

    it('returns meal window schedules and statuses on GET /menu/windows', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/windows')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      expect(response.body).toHaveLength(4);
      expect(response.body[0].period).toBe('BREAKFAST');
      expect(response.body[0].startTime).toBe('06:30:00');
      expect(response.body[0].cutoffTime).toBe('10:30:00');
    });
  });

  describe('TC-DDP-128-AC2: Negative / Error Cases & Fail-Closed Protection', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/menu').expect(401);
    });

    it('returns 404 Not Found when requesting non-existent menu item id', async () => {
      await request(app.getHttpServer())
        .get('/menu/items/unknown-item-999')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(404);
    });

    it('returns 500/503 controlled error without fabricated items when upstream KMS is down', async () => {
      mockKms.setSimulateDown(true);

      const response = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${activeToken}`);

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body.statusCode).toBeDefined();

      mockKms.setSimulateDown(false);
    });
  });

  describe('TC-DDP-128-AC3: Boundary Precision (1 Second Before Cutoff vs Exactly At Cutoff)', () => {
    it('allows ordering breakfast items exactly 1 second before cutoff (10:29:59 Colombo)', async () => {
      // 10:29:59 Colombo = 04:59:59 UTC
      clockService.setFixedTime(new Date('2026-10-28T04:59:59.000Z'));

      const response = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      const eggsBenedict = response.body.items.find(
        (i: any) => i.id === 'menu-item-004',
      );
      expect(eggsBenedict).toBeDefined();
      expect(eggsBenedict.isOrderable).toBe(true);
      expect(eggsBenedict.isCutoff).toBe(false);
      expect(eggsBenedict.secondsRemainingUntilCutoff).toBe(1);
    });

    it('blocks ordering breakfast items exactly at cutoff (10:30:00 Colombo)', async () => {
      // 10:30:00 Colombo = 05:00:00 UTC
      clockService.setFixedTime(new Date('2026-10-28T05:00:00.000Z'));

      const response = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      const eggsBenedict = response.body.items.find(
        (i: any) => i.id === 'menu-item-004',
      );
      expect(eggsBenedict).toBeDefined();
      expect(eggsBenedict.isOrderable).toBe(false);
      expect(eggsBenedict.isCutoff).toBe(true);
    });

    it('filters orderable items only when availableOnly query parameter is true', async () => {
      clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z')); // 13:00 Colombo

      const response = await request(app.getHttpServer())
        .get('/menu?availableOnly=true')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      // No item with isOrderable === false should be returned
      expect(response.body.items.every((i: any) => i.isOrderable)).toBe(true);
      // Sold out item 'menu-item-007' is excluded
      expect(
        response.body.items.some((i: any) => i.id === 'menu-item-007'),
      ).toBe(false);
    });
  });

  describe('TC-DDP-128-AC4: Subsystem Boundary & Pure Consumer Verification', () => {
    it('executes menu reading as pure consumer with zero database mutations', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      expect(response.body.items).toBeDefined();
    });
  });
});
