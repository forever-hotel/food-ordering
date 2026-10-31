import * as crypto from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { BookingInternalModule } from '../src/integrations/internal-services/booking/booking-internal.module.js';
import { FossQrActivation } from '../src/modules/guest-sessions/entities/foss-qr-activation.entity.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { FossQrActivationRepository } from '../src/modules/guest-sessions/repositories/foss-qr-activation.repository.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrActivationService } from '../src/modules/guest-sessions/services/qr-activation.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';

describe('Secure FDS QR Activation Lifecycle (e2e)', () => {
  let app: INestApplication;
  let inMemorySessions: Map<string, FossSession>;
  let inMemoryActivations: Map<string, FossQrActivation>;
  const FDS_SECRET = 'test-fds-secret-key-long-enough-32-chars';

  beforeAll(async () => {
    inMemorySessions = new Map<string, FossSession>();
    inMemoryActivations = new Map<string, FossQrActivation>();

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

    const mockQrActivationRepository = {
      save: async (activation: FossQrActivation) => {
        inMemoryActivations.set(activation.activationId, activation);
        return activation;
      },
      findByTokenHash: async (tokenHash: string) => {
        for (const act of inMemoryActivations.values()) {
          if (act.tokenHash === tokenHash) return act;
        }
        return null;
      },
      atomicRedeem: async (tokenHash: string, redeemedAt: Date) => {
        // Enforce atomic single-use check
        for (const act of inMemoryActivations.values()) {
          if (
            act.tokenHash === tokenHash &&
            !act.redeemedAt &&
            !act.revokedAt &&
            act.expiresAt > redeemedAt
          ) {
            act.redeemedAt = redeemedAt;
            return act;
          }
        }
        return null;
      },
      atomicRedeemWithManager: async (
        _manager: any,
        tokenHash: string,
        redeemedAt: Date,
      ) => {
        return mockQrActivationRepository.atomicRedeem(tokenHash, redeemedAt);
      },
      revokeUnredeemedByBookingId: async (
        bookingId: string,
        revokedAt: Date,
      ) => {
        let count = 0;
        for (const act of inMemoryActivations.values()) {
          if (
            act.bookingId === bookingId &&
            !act.redeemedAt &&
            !act.revokedAt
          ) {
            act.revokedAt = revokedAt;
            count++;
          }
        }
        return count;
      },
    };

    const mockDataSource = {
      transaction: async (cb: (m: any) => Promise<any>) => {
        const mockManager = {
          findOne: async (_entityClass: any, opts: any) => {
            if (opts?.where?.bookingId) {
              return mockSessionRepository.findByBookingId(
                opts.where.bookingId,
              );
            }
            return null;
          },
          save: async (entity: any) => {
            if (entity instanceof FossSession || entity.sessionId) {
              return mockSessionRepository.save(entity);
            }
            return mockQrActivationRepository.save(entity);
          },
        };
        return cb(mockManager);
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
              INTERNAL_SERVICE_KEY: FDS_SECRET,
              INTERNAL_SERVICE_SECRET: FDS_SECRET,
              QR_SIGNING_SECRET: 'test-e2e-qr-secret-key-32-chars-long',
              SESSION_TTL_HOURS: '24',
              QR_ACTIVATION_TTL_MINUTES: '15',
              FOSS_PUBLIC_APP_URL: 'https://guest.foreverhotel.com',
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
        {
          provide: FossQrActivationRepository,
          useValue: mockQrActivationRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        QrTokenService,
        QrActivationService,
        GuestSessionsService,
        GuestAuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Protected Internal QR Issuance (POST /guest-sessions/internal/qr/issue)', () => {
    it('rejects issuance when X-Internal-Service-Key is missing (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(401);

      expect(response.body.message).toContain(
        'Internal service authentication credential is required',
      );
    });

    it('rejects issuance when X-Internal-Service-Key is invalid (403)', async () => {
      await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', 'invalid-key')
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(403);
    });

    it('validates request DTO and rejects missing roomNumber (400)', async () => {
      await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
        })
        .expect(400);
    });

    it('rejects issuance for reserved but not checked-in booking (403 Forbidden)', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1020000-0000-4000-8000-000000000102',
          roomNumber: '102',
        })
        .expect(403);

      expect(response.body.message).toContain('RESERVED');
    });

    it('rejects issuance when room number does not match booking (403 Forbidden)', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '999',
        })
        .expect(403);

      expect(response.body.message).toContain('Room number mismatch');
    });

    it('successfully issues QR activation credential for checked-in booking 101', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.status).toBe('ACTIVATED');
      expect(response.body.qrToken).toBeDefined();
      expect(response.body.qrToken.length).toBeGreaterThanOrEqual(40);
      expect(response.body.activationUrl).toBe(
        `https://guest.foreverhotel.com/activate?token=${response.body.qrToken}`,
      );
      expect(response.body.expiresAt).toBeDefined();

      // Ensure credential was stored only as SHA-256 hash
      const hash = crypto
        .createHash('sha256')
        .update(response.body.qrToken)
        .digest('hex');
      const stored = Array.from(inMemoryActivations.values()).find(
        (a) => a.tokenHash === hash,
      );
      expect(stored).toBeDefined();
      expect(stored!.roomNumber).toBe('101');
    });

    it('supports alias POST /guest-sessions/internal/qr-issue and bookingReference field', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr-issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingReference: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      expect(response.body.status).toBe('ACTIVATED');
      expect(response.body.activationUrl).toBeDefined();
    });

    it('rejects disparate bookingId UUID and human-readable bookingReference code with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          bookingReference: 'BK-2026-001',
          roomNumber: '101',
        })
        .expect(400);

      expect(response.body.message).toMatch(
        /Mismatched booking identifier types/i,
      );
    });
  });

  describe('2. Atomic Single-Use Redemption (POST /guest-sessions/qr)', () => {
    it('redeems fresh activation credential and establishes guest session', async () => {
      const issueRes = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      const qrToken = issueRes.body.qrToken;

      const redeemRes = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(200);

      expect(redeemRes.headers['cache-control']).toBe('no-store');
      expect(redeemRes.body.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
      expect(redeemRes.body.roomNumber).toBe('101');
      expect(redeemRes.body.sessionToken).toBeDefined();
      expect(redeemRes.body.active).toBe(true);

      // Verify replay attack is rejected immediately
      const replayRes = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken })
        .expect(401);

      expect(replayRes.body.message).toContain('already been redeemed');
    });

    it('guarantees atomic concurrency: exactly 1 of 2 concurrent redemptions succeeds', async () => {
      const issueRes = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      const qrToken = issueRes.body.qrToken;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/guest-sessions/qr')
          .send({ qrToken }),
        request(app.getHttpServer())
          .post('/guest-sessions/qr')
          .send({ qrToken }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 401]);
    });
  });

  describe('3. Reissue Invalidation and Event Revocation', () => {
    it('invalidates prior unredeemed activation upon issuing replacement QR', async () => {
      const issue1 = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      const issue2 = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      // Old QR 1 is revoked
      const redeem1 = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: issue1.body.qrToken })
        .expect(401);

      expect(redeem1.body.message).toContain('revoked');

      // Replacement QR 2 succeeds
      const redeem2 = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: issue2.body.qrToken })
        .expect(200);

      expect(redeem2.body.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
    });

    it('revokes unredeemed activation slips when FDS checkout event is received', async () => {
      const issue = await request(app.getHttpServer())
        .post('/guest-sessions/internal/qr/issue')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      // Trigger checkout event from FDS
      await request(app.getHttpServer())
        .post('/guest-sessions/internal/events/checkout')
        .set('X-Internal-Service-Key', FDS_SECRET)
        .send({
          eventId: 'evt-checkout-qr-test-1',
          eventType: 'fds.guest.checkout',
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          checkoutTime: new Date().toISOString(),
        })
        .expect(200);

      // Unused QR slip is now revoked
      const redeem = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({ qrToken: issue.body.qrToken })
        .expect(401);

      expect(redeem.body.message).toContain('revoked');
    });
  });
});
