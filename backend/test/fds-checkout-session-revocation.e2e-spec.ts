import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { InternalServiceGuard } from '../src/common/auth/internal-service.guard.js';
import { RoomOwnershipGuard } from '../src/common/auth/room-ownership.guard.js';
import { BOOKING_PROVIDER } from '../src/integrations/internal-services/booking/interfaces/booking-provider.interface.js';
import { BookingVerificationService } from '../src/integrations/internal-services/booking/booking-verification.service.js';
import { MockBookingAdapter } from '../src/integrations/internal-services/booking/adapters/mock-booking.adapter.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';

describe('FDS Checkout, Session Revocation & Room Reassignment (e2e)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;
  let bookingAdapter: MockBookingAdapter;
  const inMemorySessions = new Map<string, FossSession>();

  const internalKey = 'test-internal-fds-secret-32-chars';
  const qrSecret = 'test-qr-signing-secret-at-least-32-chars';

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
          if (session.sessionToken === token && session.isActive) {
            return session;
          }
        }
        return null;
      },
      save: async (session: FossSession) => {
        inMemorySessions.set(session.sessionId, session);
        return session;
      },
    };

    bookingAdapter = new MockBookingAdapter();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              DEMO_MODE: 'true',
              INTERNAL_SERVICE_KEY: internalKey,
              QR_SIGNING_SECRET: qrSecret,
              SESSION_TTL_HOURS: '24',
            }),
          ],
        }),
      ],
      controllers: [GuestSessionsController],
      providers: [
        {
          provide: FossSessionRepository,
          useValue: mockSessionRepository,
        },
        {
          provide: BOOKING_PROVIDER,
          useValue: bookingAdapter,
        },
        BookingVerificationService,
        QrTokenService,
        GuestSessionsService,
        GuestAuthGuard,
        RoomOwnershipGuard,
        InternalServiceGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    qrTokenService = moduleFixture.get<QrTokenService>(QrTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    inMemorySessions.clear();
    bookingAdapter.reset();
  });

  it('TC-DDP-125-AC1: checkout revokes guest access immediately after event is processed', async () => {
    // 1. Establish guest session for room 101
    const qrToken = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    const authRes = await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken })
      .expect(200);

    const bearerToken = authRes.body.sessionToken;

    // 2. Verify active access works
    const meRes = await request(app.getHttpServer())
      .get('/guest-sessions/me')
      .set('Authorization', `Bearer ${bearerToken}`)
      .expect(200);

    expect(meRes.body.roomNumber).toBe('101');
    expect(meRes.body.active).toBe(true);

    // 3. FDS emits checkout event via webhook endpoint
    const checkoutRes = await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/checkout')
      .set('x-internal-service-key', internalKey)
      .send({
        eventId: 'evt-checkout-ac1',
        eventType: 'fds.guest.checkout',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        checkoutTime: new Date().toISOString(),
      })
      .expect(200);

    expect(checkoutRes.body.success).toBe(true);
    expect(checkoutRes.body.sessionRevoked).toBe(true);

    // 4. Guest's subsequent request with old token is rejected
    const blockedRes = await request(app.getHttpServer())
      .get('/guest-sessions/me')
      .set('Authorization', `Bearer ${bearerToken}`)
      .expect(401);

    expect(blockedRes.body.message).toContain(
      'Active session not found or revoked',
    );
  });

  it('TC-DDP-125-AC1b: room reassignment revokes old session, requiring new room authentication', async () => {
    // 1. Guest in room 101
    const qrToken = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    const authRes = await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken })
      .expect(200);

    const oldBearerToken = authRes.body.sessionToken;

    // 2. FDS emits room reassignment event from 101 to 105
    const reassignRes = await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/room-reassign')
      .set('x-internal-service-key', internalKey)
      .send({
        eventId: 'evt-reassign-ac1b',
        eventType: 'fds.room.reassigned',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        previousRoomNumber: '101',
        newRoomNumber: '105',
        reassignedAt: new Date().toISOString(),
        reason: 'Guest upgrade requested',
      })
      .expect(200);

    expect(reassignRes.body.sessionRevoked).toBe(true);

    // 3. Old token is immediately rejected
    await request(app.getHttpServer())
      .get('/guest-sessions/me')
      .set('Authorization', `Bearer ${oldBearerToken}`)
      .expect(401);
  });

  it('TC-DDP-125-AC2: duplicate / out-of-order checkout event is handled idempotently without reactivating session', async () => {
    // 1. Establish session
    const qrToken = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken })
      .expect(200);

    const eventPayload = {
      eventId: 'evt-checkout-idempotent-1',
      eventType: 'fds.guest.checkout',
      bookingId: 'b1010000-0000-4000-8000-000000000101',
      roomNumber: '101',
      checkoutTime: new Date().toISOString(),
    };

    // First delivery
    const firstDelivery = await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/checkout')
      .set('x-internal-service-key', internalKey)
      .send(eventPayload)
      .expect(200);

    expect(firstDelivery.body.sessionRevoked).toBe(true);
    expect(firstDelivery.body.duplicate).toBeUndefined();

    // Second delivery (duplicate replay)
    const secondDelivery = await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/checkout')
      .set('x-internal-service-key', internalKey)
      .send(eventPayload)
      .expect(200);

    expect(secondDelivery.body.duplicate).toBe(true);
    expect(secondDelivery.body.message).toContain('idempotently');

    // Verify lookup of event status
    const lookupRes = await request(app.getHttpServer())
      .get('/guest-sessions/internal/events/evt-checkout-idempotent-1')
      .set('x-internal-service-key', internalKey)
      .expect(200);

    expect(lookupRes.body.processed).toBe(true);
    expect(lookupRes.body.event.eventType).toBe('fds.guest.checkout');
  });

  it('TC-DDP-125-AC2b: unauthorized webhook requests without valid credentials are rejected', async () => {
    // Missing credential header
    await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/checkout')
      .send({
        eventId: 'evt-unauthorized',
        eventType: 'fds.guest.checkout',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      })
      .expect(401);

    // Invalid credential header
    await request(app.getHttpServer())
      .post('/guest-sessions/internal/events/checkout')
      .set('x-internal-service-key', 'wrong-key-value')
      .send({
        eventId: 'evt-unauthorized-2',
        eventType: 'fds.guest.checkout',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      })
      .expect(403);
  });

  it('TC-DDP-125-AC3: missed/lagged event recovery: token validation authoritatively revokes stale stay', async () => {
    // 1. Establish session
    const qrToken = qrTokenService.createToken(
      'b1010000-0000-4000-8000-000000000101',
      '101',
    );
    const authRes = await request(app.getHttpServer())
      .post('/guest-sessions/qr')
      .send({ qrToken })
      .expect(200);

    const bearerToken = authRes.body.sessionToken;

    // 2. Simulate FDS status changed to CHECKED_OUT directly in upstream authority (simulating missed event webhook)
    await bookingAdapter.checkoutBooking(
      'b1010000-0000-4000-8000-000000000101',
    );

    // 3. Calling protected endpoint detects checked-out stay through authoritative re-verification
    const res = await request(app.getHttpServer())
      .get('/guest-sessions/me')
      .set('Authorization', `Bearer ${bearerToken}`)
      .expect(401);

    expect(res.body.message).toContain(
      'Guest stay has concluded or is no longer checked in',
    );
  });
});
