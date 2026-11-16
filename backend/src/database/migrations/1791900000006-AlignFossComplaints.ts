import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive schema alignment for foss_complaints.
 *
 * Preserves the canonical complaint_id UUID and inbound foreign keys from
 * mad_complaint_history, mad_complaint_outbox, and mad_complaint_state.
 * Adds missing approved operational columns:
 * - public_reference (VARCHAR(50)) for CMP-... identifiers
 * - subject (VARCHAR(150) DEFAULT 'Guest Complaint')
 * - idempotency_key (VARCHAR(128))
 * - assigned_manager (VARCHAR(100))
 *
 * Creates partial unique indexes on idempotency_key and public_reference
 * to avoid unique constraint violations on existing legacy records.
 */
export class AlignFossComplaints1791900000006 implements MigrationInterface {
  name = 'AlignFossComplaints1791900000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        ADD COLUMN IF NOT EXISTS "public_reference" VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "subject" VARCHAR(150) NOT NULL DEFAULT 'Guest Complaint',
        ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128),
        ADD COLUMN IF NOT EXISTS "assigned_manager" VARCHAR(100);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_foss_complaints_idempotency_key"
        ON "foss_complaints" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_foss_complaints_public_reference"
        ON "foss_complaints" ("public_reference")
        WHERE "public_reference" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_booking_room"
        ON "foss_complaints" ("booking_id", "room_number");
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'foss_complaints'
            AND column_name = 'referenced_order_id'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_referenced_order"
            ON "foss_complaints" ("referenced_order_id");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'foss_complaints'
            AND column_name = 'referenced_request_id'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_referenced_request"
            ON "foss_complaints" ("referenced_request_id");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_complaints_referenced_request";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_complaints_referenced_order";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_complaints_booking_room";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_foss_complaints_public_reference";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_foss_complaints_idempotency_key";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        DROP COLUMN IF EXISTS "assigned_manager",
        DROP COLUMN IF EXISTS "idempotency_key",
        DROP COLUMN IF EXISTS "subject",
        DROP COLUMN IF EXISTS "public_reference";
    `);
  }
}
