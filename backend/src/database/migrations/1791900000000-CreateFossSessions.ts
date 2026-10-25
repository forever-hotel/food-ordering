import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the FOSS-owned guest session table.
 *
 * Booking and Room belong to other hotel subsystems. Their identifiers
 * are stored without creating duplicate external-domain tables.
 *
 * Cross-service foreign keys must be coordinated through the approved
 * shared database schema before they are introduced.
 */
export class CreateFossSessions1791900000000 implements MigrationInterface {
  name = 'CreateFossSessions1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "foss_sessions" (
        "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "booking_id" UUID NOT NULL,
        "room_number" VARCHAR(10) NOT NULL,
        "session_token" VARCHAR(500) NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expires_at" TIMESTAMPTZ NOT NULL,

        CONSTRAINT "PK_foss_sessions_session_id"
          PRIMARY KEY ("session_id"),

        CONSTRAINT "UQ_foss_sessions_booking_id"
          UNIQUE ("booking_id"),

        CONSTRAINT "UQ_foss_sessions_session_token"
          UNIQUE ("session_token")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "foss_sessions"
    `);
  }
}
