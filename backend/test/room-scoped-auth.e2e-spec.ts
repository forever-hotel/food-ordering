import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { RoomOwnershipGuard } from '../src/common/auth/room-ownership.guard.js';
import { BookingInternalModule } from '../src/integrations/internal-services/booking/booking-internal.module.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';

describe('Server-Side Room-Scoped Authorization & IDOR Protection (e2e)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;
  let room101Token: string;
  const inMemorySessions = new Map<string, FossSession>();

  beforeAll(async () => {
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
              QR_SIGNING_SECRET: 'test-room-scope-secret-key-32-chars',
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
        RoomOwnershipGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    qrTokenService = app.get(QrTokenService);

    // Authenticate a valid guest for Room 101 to obtain bearer token
    const qr101 = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    const loginRes = await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken: qr101 })
      .expect(200);

    room101Token = loginRes.body.sessionToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TC-DDP-124-AC1: Successful Room & Booking Scoped Access', () => {
    it('allows Room 101 guest to access their own room-scoped resources', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/rooms/101')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(response.body.authorized).toBe(true);
      expect(response.body.roomNumber).toBe('101');
    });

    it('allows Room 101 guest to access their own booking-scoped resources', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/bookings/b1010000-0000-4000-8000-000000000101')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(200);

      expect(response.body.authorized).toBe(true);
      expect(response.body.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
    });
  });

  describe('TC-DDP-124-AC2: Negative / Unauthenticated Requests', () => {
    it('rejects access without Authorization header with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/guest-sessions/rooms/101')
        .expect(401);
    });

    it('rejects access with invalid bearer token with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/guest-sessions/rooms/101')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('TC-DDP-124-AC3: Cross-Room & Cross-Booking IDOR Prevention', () => {
    it('rejects Room 101 guest attempting to access Room 102 resource with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/rooms/102')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('rejects Room 101 guest attempting to access arbitrary Room 999 with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/rooms/999')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('rejects Room 101 guest attempting to access another booking ID with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/guest-sessions/bookings/b1020000-0000-4000-8000-000000000102')
        .set('Authorization', `Bearer ${room101Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });
  });
});
