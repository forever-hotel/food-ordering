import * as crypto from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { BookingVerificationService } from '../src/integrations/internal-services/booking/booking-verification.service.js';
import {
  BookingProvider,
  BookingRecord,
} from '../src/integrations/internal-services/booking/interfaces/booking-provider.interface.js';
import { BookingStatus } from '../src/integrations/internal-services/booking/enums/booking-status.enum.js';
import { FossQrActivation } from '../src/modules/guest-sessions/entities/foss-qr-activation.entity.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';
import { FossQrActivationRepository } from '../src/modules/guest-sessions/repositories/foss-qr-activation.repository.js';
import { FossSessionRepository } from '../src/modules/guest-sessions/repositories/foss-session.repository.js';
import { QrActivationService } from '../src/modules/guest-sessions/services/qr-activation.service.js';

class RealPostgresTestBookingProvider implements BookingProvider {
  async getBookingById(bookingId: string): Promise<BookingRecord | null> {
    return {
      bookingId,
      roomNumber: '101',
      status: BookingStatus.CHECKED_IN,
      stayStart: new Date(Date.now() - 3600000),
      stayEnd: new Date(Date.now() + 86400000),
      guestName: 'Postgres Real Test Guest',
    };
  }

  async verifyBooking(
    bookingId: string,
    roomNumber: string,
  ): Promise<BookingRecord> {
    return {
      bookingId,
      roomNumber,
      status: BookingStatus.CHECKED_IN,
      stayStart: new Date(Date.now() - 3600000),
      stayEnd: new Date(Date.now() + 86400000),
      guestName: 'Postgres Real Test Guest',
    };
  }
}

const isPostgresTestEnabled =
  process.env.RUN_POSTGRES_TESTS === 'true' ||
  Boolean(process.env.TEST_POSTGRES_URL);

const describePostgres = isPostgresTestEnabled ? describe : describe.skip;

describePostgres('Real PostgreSQL Integration & Concurrency Testing', () => {
  let dataSource: DataSource;
  let qrService: QrActivationService;
  let qrActivationRepo: FossQrActivationRepository;
  let fossSessionRepo: FossSessionRepository;

  const TEST_DB_URL =
    process.env.TEST_POSTGRES_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54329/foss_isolated_test';

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      entities: [FossQrActivation, FossSession],
      synchronize: false,
      logging: false,
    });

    await dataSource.initialize();

    // Verify database identity: strictly fail if shared Neon or wrong database
    const dbInfo = await dataSource.query(`
        SELECT 
          current_database() AS db_name,
          inet_server_addr() AS server_addr,
          version() AS pg_version
      `);

    const dbName = String(dbInfo[0].db_name);
    if (dbName !== 'foss_isolated_test') {
      throw new Error(
        `CRITICAL SAFETY ABORT: Database name [${dbName}] is NOT foss_isolated_test!`,
      );
    }

    // Apply exact schema
    await dataSource.query(`
        DROP TABLE IF EXISTS "foss_qr_activations" CASCADE;
        DROP TABLE IF EXISTS "foss_sessions" CASCADE;

        CREATE TABLE "foss_sessions" (
          "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "booking_id" UUID NOT NULL,
          "room_number" VARCHAR(10) NOT NULL,
          "session_token" VARCHAR(500) NOT NULL,
          "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expires_at" TIMESTAMPTZ NOT NULL,
          CONSTRAINT "PK_foss_sessions_session_id" PRIMARY KEY ("session_id"),
          CONSTRAINT "UQ_foss_sessions_booking_id" UNIQUE ("booking_id"),
          CONSTRAINT "UQ_foss_sessions_session_token" UNIQUE ("session_token")
        );

        CREATE TABLE "foss_qr_activations" (
          "activation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "booking_id" UUID NOT NULL,
          "room_number" VARCHAR(10) NOT NULL,
          "token_hash" VARCHAR(64) NOT NULL,
          "expires_at" TIMESTAMPTZ NOT NULL,
          "redeemed_at" TIMESTAMPTZ,
          "revoked_at" TIMESTAMPTZ,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "issued_by" VARCHAR(100),
          CONSTRAINT "PK_foss_qr_activations_activation_id" PRIMARY KEY ("activation_id"),
          CONSTRAINT "UQ_foss_qr_activations_token_hash" UNIQUE ("token_hash")
        );

        CREATE INDEX "IDX_foss_qr_activations_booking_id" ON "foss_qr_activations" ("booking_id");
        CREATE INDEX "IDX_foss_qr_activations_room_number" ON "foss_qr_activations" ("room_number");
        CREATE INDEX "IDX_foss_qr_activations_active_lookup" ON "foss_qr_activations" ("token_hash", "redeemed_at", "revoked_at", "expires_at");
      `);

    qrActivationRepo = new FossQrActivationRepository(
      dataSource.getRepository(FossQrActivation),
    );
    fossSessionRepo = new FossSessionRepository(
      dataSource.getRepository(FossSession),
    );
    const bookingProvider = new RealPostgresTestBookingProvider();
    const bookingVerificationService = new BookingVerificationService(
      bookingProvider,
    );
    const configService = {
      get: (key: string) => {
        if (key === 'QR_ACTIVATION_TTL_MINUTES') return '15';
        if (key === 'SESSION_TTL_HOURS') return '24';
        if (key === 'FOSS_FRONTEND_URL')
          return 'https://guest.foreverhotel.com';
        return null;
      },
    } as unknown as ConfigService;

    qrService = new QrActivationService(
      qrActivationRepo,
      fossSessionRepo,
      bookingVerificationService,
      configService,
      dataSource,
    );
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('1. Single-use token redemption: first succeeds, second fails with replay rejection', async () => {
    const bookingId = '11111111-1111-4000-8000-111111111111';
    const issue = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '101',
    });

    // 1st redemption succeeds
    const redeem = await qrService.redeemActivationCredential(issue.qrToken);
    expect(redeem.active).toBe(true);
    expect(redeem.bookingId).toBe(bookingId);

    // Verify PostgreSQL state
    const rows = await dataSource.query(
      `SELECT "redeemed_at" FROM "foss_qr_activations" WHERE "booking_id" = $1`,
      [bookingId],
    );
    expect(rows[0].redeemed_at).not.toBeNull();

    // 2nd redemption (replay attempt) rejects
    await expect(
      qrService.redeemActivationCredential(issue.qrToken),
    ).rejects.toThrow(/already been redeemed/i);
  });

  it('2. Simultaneous concurrent redemptions: exactly one succeeds and one is rejected', async () => {
    const bookingId = '22222222-2222-4000-8000-222222222222';
    const issue = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '102',
    });

    // Fire 2 concurrent redemptions for the same token
    const results = await Promise.allSettled([
      qrService.redeemActivationCredential(issue.qrToken),
      qrService.redeemActivationCredential(issue.qrToken),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify exactly one session exists in PostgreSQL
    const sessionRows = await dataSource.query(
      `SELECT count(*) FROM "foss_sessions" WHERE "booking_id" = $1`,
      [bookingId],
    );
    expect(Number(sessionRows[0].count)).toBe(1);
  });

  it('3. Session write failure triggers transaction rollback, leaving token unconsumed for retry', async () => {
    const bookingId = '33333333-3333-4000-8000-333333333333';
    const issue = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '103',
    });
    const tokenHash = qrService.hashToken(issue.qrToken);

    // Simulate session persistence failure inside DataSource transaction
    await expect(
      dataSource.transaction(async (manager: EntityManager) => {
        const redeemed = await qrActivationRepo.atomicRedeemWithManager(
          manager,
          tokenHash,
          new Date(),
        );
        expect(redeemed).not.toBeNull();

        // Intentionally trigger a NOT NULL constraint violation on session_token
        await manager.query(
          `INSERT INTO "foss_sessions" ("session_id", "booking_id", "room_number", "session_token", "expires_at") VALUES ($1, $2, $3, NULL, $4)`,
          [
            crypto.randomUUID(),
            bookingId,
            '103',
            new Date(Date.now() + 86400000),
          ],
        );
      }),
    ).rejects.toThrow();

    // Verify that PostgreSQL transaction rolled back and redeemed_at remains NULL
    const actRows = await dataSource.query(
      `SELECT "redeemed_at" FROM "foss_qr_activations" WHERE "token_hash" = $1`,
      [tokenHash],
    );
    expect(actRows[0].redeemed_at).toBeNull();

    // Verify that the guest can now successfully redeem the unconsumed token!
    const successfulRetry = await qrService.redeemActivationCredential(
      issue.qrToken,
    );
    expect(successfulRetry.active).toBe(true);
    expect(successfulRetry.bookingId).toBe(bookingId);
  });

  it('4. Concurrent QR reissuance invalidates superseded tokens in PostgreSQL', async () => {
    const bookingId = '44444444-4444-4000-8000-444444444444';
    const issueA = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '104',
    });
    const issueB = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '104',
    });

    // Token A must have revoked_at set in PostgreSQL
    const rowsA = await dataSource.query(
      `SELECT "revoked_at" FROM "foss_qr_activations" WHERE "token_hash" = $1`,
      [qrService.hashToken(issueA.qrToken)],
    );
    expect(rowsA[0].revoked_at).not.toBeNull();

    // Redeeming Token A must fail
    await expect(
      qrService.redeemActivationCredential(issueA.qrToken),
    ).rejects.toThrow(/replaced or revoked/i);

    // Redeeming Token B must succeed
    const redeemB = await qrService.redeemActivationCredential(issueB.qrToken);
    expect(redeemB.active).toBe(true);
  });

  it('5. Checkout revocation in PostgreSQL prevents subsequent redemption', async () => {
    const bookingId = '55555555-5555-4000-8000-555555555555';
    const issue = await qrService.issueActivationCredential({
      bookingId,
      roomNumber: '105',
    });

    // FDS checkout event revokes pending activations
    const count = await qrService.revokeBookingActivations(bookingId);
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify revoked_at in PostgreSQL
    const rows = await dataSource.query(
      `SELECT "revoked_at" FROM "foss_qr_activations" WHERE "token_hash" = $1`,
      [qrService.hashToken(issue.qrToken)],
    );
    expect(rows[0].revoked_at).not.toBeNull();

    // Redeeming revoked token must fail
    await expect(
      qrService.redeemActivationCredential(issue.qrToken),
    ).rejects.toThrow(/replaced or revoked/i);
  });
});
