import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the FOSS-owned QR activation credential table.
 *
 * Stores single-use, short-lived activation credential hashes issued by FDS.
 * Raw activation tokens are NEVER stored in PostgreSQL.
 *
 * Indexed for fast single-use lookup and atomic redemption concurrency.
 */
export class CreateFossQrActivations1791900000004 implements MigrationInterface {
  name = 'CreateFossQrActivations1791900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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

        CONSTRAINT "PK_foss_qr_activations_activation_id"
          PRIMARY KEY ("activation_id"),

        CONSTRAINT "UQ_foss_qr_activations_token_hash"
          UNIQUE ("token_hash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_foss_qr_activations_booking_id"
        ON "foss_qr_activations" ("booking_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_foss_qr_activations_room_number"
        ON "foss_qr_activations" ("room_number")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_foss_qr_activations_active_lookup"
        ON "foss_qr_activations" ("token_hash", "redeemed_at", "revoked_at", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_qr_activations_active_lookup"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_qr_activations_room_number"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_qr_activations_booking_id"
    `);
    await queryRunner.query(`
      DROP TABLE "foss_qr_activations"
    `);
  }
}
