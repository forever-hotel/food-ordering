import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { BookingInternalModule } from '../src/integrations/internal-services/booking/booking-internal.module.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';

describe('Guest Sessions Lifecycle (e2e)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;
  let inMemorySessions: Map<string, FossSession>;

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              DEMO_MODE: 'true',
              QR_SIGNING_SECRET: 'test-e2e-qr-secret-key-32-chars-long',
              SESSION_TTL_HOURS: '24',
            }),
          ],
        }),
        BookingInternalModule,
      ],
      controllers: [GuestSessionsController],
      providers: [
        {
          provide: FossSessionRepository,
          useValue: mockSessionRepository,
        },
        QrTokenService,
        GuestSessionsService,
        GuestAuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    qrTokenService = app.get(QrTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /guest-sessions/qr', () => {
    it('TC-DDP-123-AC1: authenticates checked-in booking 101 and establishes room-scoped session', async () => {
      const qrToken = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );

      const response = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(200);

      expect(response.body.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
      expect(response.body.roomNumber).toBe('101');
      expect(response.body.sessionToken).toBeDefined();
      expect(response.body.guestName).toBe('Demo Guest 101');
      expect(response.body.active).toBe(true);
      expect(response.body.sessionId).toBeDefined();
    });

    it('TC-DDP-123-AC2: rejects reserved stay 102 with 403 Forbidden', async () => {
      const qrToken = qrTokenService.createToken(
        'b1020000-0000-4000-8000-000000000102',
        '102',
      );

      await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(403);
    });

    it('TC-DDP-123-AC2: rejects checked-out stay 103 with 403 Forbidden', async () => {
      const qrToken = qrTokenService.createToken(
        'b1030000-0000-4000-8000-000000000103',
        '103',
      );

      await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(403);
    });

    it('TC-DDP-123-AC2: rejects cancelled stay 104 with 403 Forbidden', async () => {
      const qrToken = qrTokenService.createToken(
        'b1040000-0000-4000-8000-000000000104',
        '104',
      );

      await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(403);
    });

    it('TC-DDP-123-AC2: rejects expired stay window 105 with 403 Forbidden', async () => {
      const qrToken = qrTokenService.createToken(
        'b1050000-0000-4000-8000-000000000105',
        '105',
      );

      await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(403);
    });

    it('TC-DDP-123-AC2: rejects forged/tampered QR signature with 401 Unauthorized', async () => {
      const validToken = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
      const [payload] = validToken.split('.');
      const tampered = `${payload}.tampered_signature`;

      await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: tampered })
        .expect(401);
    });

    it('TC-DDP-123-AC3: concurrent or repeated scans for same booking refresh session idempotently', async () => {
      const token1 = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
      const res1 = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: token1 })
        .expect(200);

      const token2 = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
      const res2 = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: token2 })
        .expect(200);

      // Session ID is preserved under uniqueness constraint
      expect(res2.body.sessionId).toBe(res1.body.sessionId);
      expect(res2.body.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
    });
  });

  describe('GET /guest-sessions/me and POST /guest-sessions/logout', () => {
    let bearerToken: string;

    beforeEach(async () => {
      const token = qrTokenService.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
      const res = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: token })
        .expect(200);

      bearerToken = res.body.sessionToken;
    });

    it('TC-DDP-123-AC1: retrieves authenticated guest context with valid Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/me')
        .set('Authorization', `Bearer ${bearerToken}`)
        .expect(200);

      expect(response.body.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
      expect(response.body.roomNumber).toBe('101');
      expect(response.body.guestName).toBe('Demo Guest 101');
      expect(response.body.role).toBe('GUEST');
      expect(response.body.active).toBe(true);
    });

    it('TC-DDP-123-AC2: rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/guest-sessions/me').expect(401);

      await request(app.getHttpServer())
        .get('/guest-sessions/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('TC-DDP-123-AC1: logs out guest and invalidates session token', async () => {
      await request(app.getHttpServer())
        .post('/guest-sessions/logout')
        .set('Authorization', `Bearer ${bearerToken}`)
        .expect(200);

      // Subsequent access with the logged-out token is rejected
      await request(app.getHttpServer())
        .get('/guest-sessions/me')
        .set('Authorization', `Bearer ${bearerToken}`)
        .expect(401);
    });
  });

  describe('GET /guest-sessions/demo-tokens', () => {
    it('TC-DDP-123-AC4: returns pre-signed demo tokens for testing and demo flows', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/demo-tokens')
        .expect(200);

      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens['101-checked-in']).toBeDefined();
      expect(response.body.tokens['102-reserved']).toBeDefined();
    });
  });
});
