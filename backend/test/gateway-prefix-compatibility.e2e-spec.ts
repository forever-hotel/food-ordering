import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { InternalServiceGuard } from '../src/common/auth/internal-service.guard.js';
import { RoomOwnershipGuard } from '../src/common/auth/room-ownership.guard.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { correlationMiddleware } from '../src/common/middleware/correlation.middleware.js';
import { createIngressPrefixMiddleware } from '../src/common/middleware/ingress-prefix.middleware.js';
import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import { BookingInternalModule } from '../src/integrations/internal-services/booking/booking-internal.module.js';
import { MockKmsAdapter } from '../src/integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { KMS_PROVIDER } from '../src/integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';
import { MenuController } from '../src/modules/menu/menu.controller.js';
import { MenuService } from '../src/modules/menu/menu.service.js';
import { HotelClockService } from '../src/modules/menu/services/hotel-clock.service.js';
import { MealWindowService } from '../src/modules/menu/services/meal-window.service.js';
import { RealtimeController } from '../src/realtime/realtime.controller.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';

describe('Gateway Ingress Prefix Compatibility (e2e)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;
  let room101Token: string;
  let inMemorySessions: Map<string, FossSession>;
  const internalSecret = 'test-internal-secret-for-gateway-e2e-32ch';

  beforeAll(async () => {
    inMemorySessions = new Map<string, FossSession>();

    const mockSessionRepository = {
      findById: async (id: string) => inMemorySessions.get(id) || null,
      findByBookingId: async (bookingId: string) => {
        for (const session of inMemorySessions.values()) {
          if (session.bookingId === bookingId) return session;
        }
        return null;
      },
      findActiveBySessionToken: async (token: string) => {
        for (const session of inMemorySessions.values()) {
          if (session.sessionToken === token && session.isActive)
            return session;
        }
        return null;
      },
      save: async (session: FossSession) => {
        inMemorySessions.set(session.sessionId, session);
        return session;
      },
    };

    const mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              DEMO_MODE: 'true',
              QR_SIGNING_SECRET: 'test-gateway-secret-key-at-least-32-chars',
              SESSION_TTL_HOURS: '24',
              INTERNAL_SERVICE_KEY: internalSecret,
              API_PREFIX: 'foss',
            }),
          ],
        }),
        BookingInternalModule,
      ],
      controllers: [
        HealthController,
        GuestSessionsController,
        MenuController,
        RealtimeController,
      ],
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: FossSessionRepository,
          useValue: mockSessionRepository,
        },
        QrTokenService,
        GuestSessionsService,
        GuestAuthGuard,
        RoomOwnershipGuard,
        InternalServiceGuard,
        MenuService,
        HotelClockService,
        MealWindowService,
        RealtimeService,
        {
          provide: KMS_PROVIDER,
          useClass: MockKmsAdapter,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Register standard pipeline matching main.ts
    app.use(correlationMiddleware);
    app.use(createIngressPrefixMiddleware());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Setup Swagger docs matching main.ts
    const config = new DocumentBuilder()
      .setTitle('Forever Hotel FOSS API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();

    qrTokenService = app.get(QrTokenService);

    // Establish an active session for Room 101
    const qr101 = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    const loginRes = await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken: qr101 })
      .expect(200);

    const cookieHeader = loginRes.headers['set-cookie'] || [];
    const match = (
      Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader
    ).match(/foss_session=([^;]+)/);
    room101Token = match ? match[1] : loginRes.body.sessionToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1 & 2. Existing direct and prefixed menu requests
  describe('1 & 2. Menu Catalog (Direct vs Prefixed)', () => {
    it('1. GET /menu - returns active menu catalog directly', async () => {
      const res = await request(app.getHttpServer())
        .get('/menu')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('2. GET /foss/menu - returns active menu catalog via normalized gateway route', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/menu')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  // 3 & 4. Direct and prefixed health endpoints
  describe('3 & 4. Health Probes (Direct vs Prefixed)', () => {
    it('3a. GET /health/live - direct liveness probe returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('3b. GET /health/ready - direct readiness probe (Gateway upstream healthcheck) returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.database.status).toBe('up');
    });

    it('4a. GET /foss/health/live - prefixed liveness probe via gateway returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/health/live')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('4b. GET /foss/health/ready - prefixed readiness probe via gateway returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.database.status).toBe('up');
    });
  });

  // 5. Guest QR authentication using the prefixed route
  describe('5. Guest QR Authentication via Prefixed Route', () => {
    it('POST /foss/guest-sessions/qr - establishes active guest session through gateway route', async () => {
      const qrToken = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );

      const res = await request(app.getHttpServer())
        .post('/foss/guest-sessions/qr')
        .send({ qrToken })
        .expect(200);

      expect(res.body.sessionToken).toBeUndefined();
      const cookieHeader = res.headers['set-cookie'] || [];
      const match = (
        Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader
      ).match(/foss_session=([^;]+)/);
      expect(match).toBeTruthy();
      expect(res.body.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
      expect(res.body.roomNumber).toBe('101');
      expect(res.body.active).toBe(true);

      room101Token = match ? match[1] : res.body.sessionToken;
    });
  });

  // 6. Room ownership and cross-booking authorization
  describe('6. Room Ownership and IDOR Protection', () => {
    it('allows guest to access own room resource via prefixed path', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/guest-sessions/rooms/101')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.authorized).toBe(true);
      expect(res.body.roomNumber).toBe('101');
    });

    it('rejects cross-room access to Room 102 with 403 Forbidden via prefixed path', async () => {
      await request(app.getHttpServer())
        .get('/foss/guest-sessions/rooms/102')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(403);
    });

    it('allows guest to access own booking resource via prefixed path', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/foss/guest-sessions/bookings/b1010000-0000-4000-8000-000000000101',
        )
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.authorized).toBe(true);
      expect(res.body.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
    });

    it('rejects cross-booking access with 403 Forbidden via prefixed path', async () => {
      await request(app.getHttpServer())
        .get('/foss/guest-sessions/bookings/other-booking-999')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(403);
    });
  });

  // 7. Query parameter preservation
  describe('7. Query Parameter Preservation', () => {
    it('preserves query parameters when forwarding through /foss', async () => {
      const directRes = await request(app.getHttpServer())
        .get('/menu?category=Starters')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      const prefixedRes = await request(app.getHttpServer())
        .get('/foss/menu?category=Starters')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(prefixedRes.body.items).toBeDefined();
      expect(prefixedRes.body.items.length).toBeGreaterThan(0);
      expect(
        prefixedRes.body.items.every(
          (item: { category: string }) => item.category === 'Starters',
        ),
      ).toBe(true);
      expect(prefixedRes.body.items).toEqual(directRes.body.items);
    });
  });

  // 8. SSE / Realtime path compatibility
  describe('8. SSE & Realtime Path Compatibility', () => {
    it('GET /realtime/events/poll - direct realtime poll returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/realtime/events/poll')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.events).toBeDefined();
    });

    it('GET /foss/realtime/events/poll - prefixed realtime poll returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/realtime/events/poll')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(res.body.events).toBeDefined();
    });
  });

  // 9. Internal webhooks on both paths and auth rejection
  describe('9. Internal Service Webhooks & Security Boundaries', () => {
    it('9a. POST /guest-sessions/internal/events/checkout - processes direct FDS checkout webhook', async () => {
      const res = await request(app.getHttpServer())
        .post('/guest-sessions/internal/events/checkout')
        .set('x-internal-service-key', internalSecret)
        .send({
          eventId: 'evt-checkout-direct-001',
          eventType: 'fds.guest.checkout',
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          checkoutTime: new Date().toISOString(),
        })
        .expect(200);

      expect(res.body.processed).toBe(true);
      expect(res.body.sessionRevoked).toBe(true);
    });

    it('9b. POST /foss/guest-sessions/internal/events/checkout - processes gateway-forwarded FDS checkout webhook', async () => {
      const res = await request(app.getHttpServer())
        .post('/foss/guest-sessions/internal/events/checkout')
        .set('x-internal-service-key', internalSecret)
        .send({
          eventId: 'evt-checkout-gateway-002',
          eventType: 'fds.guest.checkout',
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          checkoutTime: new Date().toISOString(),
        })
        .expect(200);

      expect(res.body.processed).toBe(true);
    });

    it('9c. rejects webhook when x-internal-service-key is missing (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .post('/foss/guest-sessions/internal/events/checkout')
        .send({
          eventId: 'evt-unauth-001',
          eventType: 'fds.guest.checkout',
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          checkoutTime: new Date().toISOString(),
        })
        .expect(401);
    });

    it('9d. rejects webhook with invalid x-internal-service-key (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/foss/guest-sessions/internal/events/checkout')
        .set('x-internal-service-key', 'wrong-invalid-secret-key')
        .send({
          eventId: 'evt-unauth-002',
          eventType: 'fds.guest.checkout',
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          checkoutTime: new Date().toISOString(),
        })
        .expect(403);
    });
  });

  // 10. Invalid prefixes and unrelated route rejection
  describe('10. Invalid Prefixes and Unrelated Route Rejection', () => {
    it('rejects similar prefix /fossils/menu with 404 Not Found', async () => {
      await request(app.getHttpServer()).get('/fossils/menu').expect(404);
    });

    it('rejects alternative prefix /other/menu with 404 Not Found', async () => {
      await request(app.getHttpServer()).get('/other/menu').expect(404);
    });

    it('rejects unknown sub-route /foss/non-existent-endpoint with 404 Not Found', async () => {
      await request(app.getHttpServer())
        .get('/foss/non-existent-endpoint')
        .expect(404);
    });
  });

  // 11. Swagger UI accessibility
  describe('11. Swagger UI Accessibility', () => {
    it('GET /api/docs - direct Swagger UI endpoint returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs/')
        .expect(200);

      expect(res.text).toContain('swagger');
    });

    it('GET /foss/api/docs - prefixed Swagger UI endpoint normalizes and returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/foss/api/docs/')
        .expect(200);

      expect(res.text).toContain('swagger');
    });
  });

  // 12. API Gateway cookie forwarding, HttpOnly persistence, and lifecycle rejection regression
  describe('12. Gateway Cookie Forwarding & Stay Persistence Regression', () => {
    function simulateGatewayResponseCookies(
      setCookieHeaders: string[] | string | undefined,
      allowedNames: string[],
    ): string[] {
      const rawList = Array.isArray(setCookieHeaders)
        ? setCookieHeaders
        : setCookieHeaders
          ? [setCookieHeaders]
          : [];
      const forwarded: string[] = [];
      for (const header of rawList) {
        const parts = header.split(';').map((p) => p.trim());
        const [nameVal, ...attrs] = parts;
        const eqIdx = nameVal.indexOf('=');
        if (eqIdx <= 0) continue;
        const name = nameVal.slice(0, eqIdx).trim();
        if (!allowedNames.includes(name)) continue;
        const cleanedAttrs = attrs.filter(
          (a) =>
            !/^path=/i.test(a) &&
            !/^domain=/i.test(a) &&
            !/^samesite=/i.test(a),
        );
        cleanedAttrs.push('Path=/foss', 'SameSite=Lax');
        forwarded.push(`${nameVal}; ${cleanedAttrs.join('; ')}`);
      }
      return forwarded;
    }

    function simulateGatewayRequestCookieHeader(
      cookies: Record<string, string>,
      allowedNames: string[],
    ): string {
      return Object.entries(cookies)
        .filter(([name]) => allowedNames.includes(name))
        .map(([name, val]) => `${name}=${val}`)
        .join('; ');
    }

    it('issues gateway-compatible foss_session HttpOnly cookie, authenticates /me, /menu, /renew, and /realtime-ticket, and rejects after logout', async () => {
      const gatewayAllowedCookies = ['foss_session', 'foss_csrf'];
      const qrToken = qrTokenService.createToken(
        'b1030000-0000-4000-8000-000000000103',
        '103',
      );

      // 1. Redeem QR through gateway-prefixed route
      const qrRes = await request(app.getHttpServer())
        .post('/foss/guest-sessions/qr')
        .send({ qrToken })
        .expect(200);

      expect(qrRes.body.sessionToken).toBeUndefined();
      const rawSetCookies = qrRes.headers['set-cookie'];
      expect(rawSetCookies).toBeDefined();

      // Verify raw cookie attributes directly from FOSS
      const rawCookieStr = Array.isArray(rawSetCookies)
        ? rawSetCookies.join(';')
        : String(rawSetCookies);
      expect(rawCookieStr).toContain('foss_session=');
      expect(rawCookieStr).toContain('HttpOnly');
      expect(rawCookieStr).toContain('SameSite=Lax');
      expect(rawCookieStr).toContain('Path=/');
      expect(rawCookieStr).toMatch(/Max-Age=\d+|Expires=/);

      // 2. Verify cookie survives API Gateway allowlist filtering (cookieNames: ["foss_session", "foss_csrf"])
      const gatewayForwardedSetCookies = simulateGatewayResponseCookies(
        rawSetCookies,
        gatewayAllowedCookies,
      );
      expect(gatewayForwardedSetCookies.length).toBe(1);
      expect(gatewayForwardedSetCookies[0]).toContain('foss_session=');
      expect(gatewayForwardedSetCookies[0]).toContain('Path=/foss');

      const tokenMatch = gatewayForwardedSetCookies[0].match(
        /^foss_session=([^;]+)/,
      );
      expect(tokenMatch).toBeTruthy();
      const cookieToken = tokenMatch![1];

      const outboundCookieHeader = simulateGatewayRequestCookieHeader(
        { foss_session: cookieToken, ignored_cookie: 'drop-me' },
        gatewayAllowedCookies,
      );
      expect(outboundCookieHeader).toContain('foss_session=');
      expect(outboundCookieHeader).not.toContain('ignored_cookie');

      // 3. Cookie-only authentication against /foss/guest-sessions/me (no Authorization header)
      const meRes = await request(app.getHttpServer())
        .get('/foss/guest-sessions/me')
        .set('Cookie', outboundCookieHeader)
        .expect(200);
      expect(meRes.body.bookingId).toBe('b1030000-0000-4000-8000-000000000103');
      expect(meRes.body.roomNumber).toBe('103');
      expect(meRes.body.sessionToken).toBeUndefined();

      // 4. Cookie-only authentication against /foss/menu
      const menuRes = await request(app.getHttpServer())
        .get('/foss/menu')
        .set('Cookie', outboundCookieHeader)
        .expect(200);
      expect(Array.isArray(menuRes.body.items)).toBe(true);

      // 5. Cookie-only session renewal (/foss/guest-sessions/renew):
      // Rejects missing Origin/custom header with 403 CSRF check, succeeds with browser Origin header and returns no JSON sessionToken
      await request(app.getHttpServer())
        .post('/foss/guest-sessions/renew')
        .set('Cookie', outboundCookieHeader)
        .expect(403);

      const renewRes = await request(app.getHttpServer())
        .post('/foss/guest-sessions/renew')
        .set('Cookie', outboundCookieHeader)
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      expect(renewRes.body.sessionToken).toBeUndefined();
      expect(renewRes.body.active).toBe(true);

      // 6. Cookie-only realtime ticket (/foss/guest-sessions/realtime-ticket) passes auth with browser Origin
      const prevRelayUrl = process.env.SHARED_WEBSOCKET_URL;
      const prevRelayKey = process.env.WEBSOCKET_RELAY_KEY;
      process.env.SHARED_WEBSOCKET_URL = 'https://relay.example.invalid';
      process.env.WEBSOCKET_RELAY_KEY = 'test-relay-key';
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: 'a'.repeat(43) }),
      } as any);
      try {
        const ticketRes = await request(app.getHttpServer())
          .post('/foss/guest-sessions/realtime-ticket')
          .set('Cookie', outboundCookieHeader)
          .set('Origin', 'http://localhost:3000')
          .expect(200);
        expect(ticketRes.body.ticket).toBe('a'.repeat(43));
      } finally {
        fetchSpy.mockRestore();
        if (prevRelayUrl === undefined) delete process.env.SHARED_WEBSOCKET_URL;
        else process.env.SHARED_WEBSOCKET_URL = prevRelayUrl;
        if (prevRelayKey === undefined) delete process.env.WEBSOCKET_RELAY_KEY;
        else process.env.WEBSOCKET_RELAY_KEY = prevRelayKey;
      }

      // 7. Logout revokes session and clears foss_session cookie; subsequent requests return 401
      const logoutRes = await request(app.getHttpServer())
        .post('/foss/guest-sessions/logout')
        .set('Cookie', outboundCookieHeader)
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      expect(logoutRes.body.success).toBe(true);

      await request(app.getHttpServer())
        .get('/foss/guest-sessions/me')
        .set('Cookie', outboundCookieHeader)
        .expect(401);
      await request(app.getHttpServer())
        .get('/foss/menu')
        .set('Cookie', outboundCookieHeader)
        .expect(401);
      await request(app.getHttpServer())
        .post('/foss/guest-sessions/realtime-ticket')
        .set('Cookie', outboundCookieHeader)
        .set('Origin', 'http://localhost:3000')
        .expect(401);
    });
  });
});
