import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates demonstration complaints persistence table (foss_complaints).
 *
 * In accordance with AGENTS.md §3 and DDP-133, FOSS persists guest complaints with category,
 * severity, and optional stay-scoped order/service request references, while forwarding
 * to the authoritative MAD subsystem.
 */
export class CreateFossComplaints1791900000003 implements MigrationInterface {
  name = 'CreateFossComplaints1791900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_complaints" (
        "complaint_id" VARCHAR(100) NOT NULL,
        "booking_id" UUID NOT NULL,
        "room_number" VARCHAR(10) NOT NULL,
        "category" VARCHAR(50) NOT NULL,
        "severity" VARCHAR(20) NOT NULL,
        "subject" VARCHAR(150) NOT NULL,
        "description" VARCHAR(1000) NOT NULL,
        "status" VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
        "related_order_id" VARCHAR(100),
        "related_request_id" VARCHAR(100),
        "assigned_manager" VARCHAR(100),
        "resolution_notes" VARCHAR(1000),
        "idempotency_key" VARCHAR(128) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "PK_foss_complaints_complaint_id"
          PRIMARY KEY ("complaint_id"),

        CONSTRAINT "UQ_foss_complaints_idempotency_key"
          UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_booking_room"
        ON "foss_complaints" ("booking_id", "room_number")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_related_order_id"
        ON "foss_complaints" ("related_order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_related_request_id"
        ON "foss_complaints" ("related_request_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_complaints_status"
        ON "foss_complaints" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "foss_complaints"
    `);
  }
}
