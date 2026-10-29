import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates demonstration service request persistence table (foss_service_requests).
 *
 * In accordance with AGENTS.md §3 and DDP-131, FOSS manages room-bound guest service requests
 * and dispatches corresponding worker tasks to the authoritative WKMS subsystem.
 */
export class CreateFossServiceRequests1791900000002 implements MigrationInterface {
  name = 'CreateFossServiceRequests1791900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_service_requests" (
        "request_id" VARCHAR(100) NOT NULL,
        "booking_id" UUID NOT NULL,
        "room_number" VARCHAR(10) NOT NULL,
        "request_type" VARCHAR(50) NOT NULL,
        "description" VARCHAR(500),
        "status" VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
        "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
        "task_id" VARCHAR(100),
        "assigned_staff" VARCHAR(100),
        "estimated_completion_minutes" INT NOT NULL DEFAULT 20,
        "idempotency_key" VARCHAR(128) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "PK_foss_service_requests_request_id"
          PRIMARY KEY ("request_id"),

        CONSTRAINT "UQ_foss_service_requests_idempotency_key"
          UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_service_requests_booking_room"
        ON "foss_service_requests" ("booking_id", "room_number")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_service_requests_task_id"
        ON "foss_service_requests" ("task_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "foss_service_requests"
    `);
  }
}
