import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive schema alignment for foss_service_requests.
 *
 * Preserves the canonical request_id UUID and inbound foreign keys from wkms_tasks.
 * Adds missing approved operational columns:
 * - task_id (VARCHAR(100))
 * - priority (VARCHAR(20) DEFAULT 'NORMAL')
 * - assigned_staff (VARCHAR(100))
 * - estimated_completion_minutes (INT DEFAULT 20)
 * - idempotency_key (VARCHAR(128))
 * - public_reference (VARCHAR(50))
 *
 * Creates partial unique indexes on idempotency_key and public_reference
 * to avoid unique constraint violations on existing legacy records.
 */
export class AlignFossServiceRequests1791900000005 implements MigrationInterface {
  name = 'AlignFossServiceRequests1791900000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests"
        ADD COLUMN IF NOT EXISTS "task_id" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN IF NOT EXISTS "assigned_staff" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "estimated_completion_minutes" INT NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128),
        ADD COLUMN IF NOT EXISTS "public_reference" VARCHAR(50);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_foss_service_requests_idempotency_key"
        ON "foss_service_requests" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_foss_service_requests_public_reference"
        ON "foss_service_requests" ("public_reference")
        WHERE "public_reference" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_service_requests_task_id"
        ON "foss_service_requests" ("task_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_service_requests_booking_room"
        ON "foss_service_requests" ("booking_id", "room_number");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_service_requests_booking_room";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_foss_service_requests_task_id";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_foss_service_requests_public_reference";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_foss_service_requests_idempotency_key";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests"
        DROP COLUMN IF EXISTS "public_reference",
        DROP COLUMN IF EXISTS "idempotency_key",
        DROP COLUMN IF EXISTS "estimated_completion_minutes",
        DROP COLUMN IF EXISTS "assigned_staff",
        DROP COLUMN IF EXISTS "priority",
        DROP COLUMN IF EXISTS "task_id";
    `);
  }
}
