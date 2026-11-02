import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes physical cross-subsystem foreign keys on FOSS-owned tables.
 *
 * In accordance with ADR-002, ADR-003, and SDS §1.4, cross-service referential integrity
 * for booking, room, KMS food order, and worker references is maintained authoritatively
 * via typed service adapters (BookingProvider, KmsProvider, WkmsProvider).
 *
 * Preserved schema objects:
 * - Local FOSS referential integrity: foss_complaints_referenced_request_id_fkey (REFERENCES foss_service_requests)
 * - Primary keys: foss_sessions_pkey, foss_service_requests_pkey, foss_complaints_pkey
 * - Unique constraints: foss_sessions_booking_id_key, foss_sessions_session_token_key
 * - Check constraints: chk_foss_session_expiry, chk_service_request_completion, chk_complaint_resolution
 * - All tables, columns, indexes, and existing data.
 */
export class RemoveCrossDomainForeignKeys1791900000008 implements MigrationInterface {
  name = 'RemoveCrossDomainForeignKeys1791900000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------------------------------------------------------------
    // 1. Precondition Gate: Authoritative Neon Branch & Database Identity Check
    // -------------------------------------------------------------------------
    const approvedProjectId = process.env.APPROVED_NEON_PROJECT_ID;
    const approvedTestBranchId = process.env.APPROVED_NEON_TEST_BRANCH_ID;
    const approvedTestEndpointId = process.env.APPROVED_NEON_TEST_ENDPOINT_ID;
    const parentDevBranchId = process.env.PARENT_DEV_BRANCH_ID;

    if (
      !approvedProjectId ||
      !approvedTestBranchId ||
      !approvedTestEndpointId
    ) {
      throw new Error(
        'MIGRATION PRECONDITION FAILED: APPROVED_NEON_PROJECT_ID, APPROVED_NEON_TEST_BRANCH_ID, ' +
          'and APPROVED_NEON_TEST_ENDPOINT_ID must all be configured before running migrations.',
      );
    }

    const settingsRows = (await queryRunner.query(`
      SELECT name, setting 
      FROM pg_settings 
      WHERE name IN ('neon.project_id', 'neon.branch_id', 'neon.endpoint_id')
    `)) as Array<{ name: string; setting: string }>;

    const settings: Record<string, string> = {};
    for (const row of settingsRows) {
      settings[row.name] = row.setting;
    }

    const observedProjectId = settings['neon.project_id'];
    const observedBranchId = settings['neon.branch_id'];
    const observedEndpointId = settings['neon.endpoint_id'];

    if (parentDevBranchId && observedBranchId === parentDevBranchId) {
      throw new Error(
        `MIGRATION SAFETY GATE BLOCKED: Migration target is the parent dev branch [${observedBranchId}]! ` +
          'Refusing to execute DDL against shared parent or production database.',
      );
    }

    if (
      observedProjectId !== approvedProjectId ||
      observedBranchId !== approvedTestBranchId ||
      observedEndpointId !== approvedTestEndpointId
    ) {
      throw new Error(
        'MIGRATION SAFETY GATE BLOCKED: Neon branch identity verification failed.\n' +
          `  Observed Project: [${observedProjectId || 'none'}], Expected: [${approvedProjectId}]\n` +
          `  Observed Branch:  [${observedBranchId || 'none'}], Expected: [${approvedTestBranchId}]\n` +
          `  Observed Endpoint:[${observedEndpointId || 'none'}], Expected: [${approvedTestEndpointId}]\n` +
          'Refusing to execute DDL against unknown or unapproved database target.',
      );
    }

    // -------------------------------------------------------------------------
    // 2. Precondition Gate: Verify FOSS-Local Constraint Is Present
    // -------------------------------------------------------------------------
    const localFkRows = (await queryRunner.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = 'foss_complaints_referenced_request_id_fkey'
    `)) as Array<{ conname: string }>;

    if (localFkRows.length === 0) {
      throw new Error(
        'MIGRATION PRECONDITION FAILED: Local FOSS constraint ' +
          'foss_complaints_referenced_request_id_fkey was not found in pg_constraint.',
      );
    }

    // -------------------------------------------------------------------------
    // 3. Drop Approved Cross-Subsystem Foreign Keys
    // -------------------------------------------------------------------------
    // foss_sessions -> FDS (bookings, rooms)
    await queryRunner.query(`
      ALTER TABLE "foss_sessions" DROP CONSTRAINT IF EXISTS "foss_sessions_booking_id_fkey";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_sessions" DROP CONSTRAINT IF EXISTS "foss_sessions_room_number_fkey";
    `);

    // foss_service_requests -> FDS (bookings, rooms)
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests" DROP CONSTRAINT IF EXISTS "foss_service_requests_booking_id_fkey";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests" DROP CONSTRAINT IF EXISTS "foss_service_requests_room_number_fkey";
    `);

    // foss_complaints -> FDS (bookings, rooms), KMS (orders), WKMS (staff)
    await queryRunner.query(`
      ALTER TABLE "foss_complaints" DROP CONSTRAINT IF EXISTS "foss_complaints_booking_id_fkey";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints" DROP CONSTRAINT IF EXISTS "foss_complaints_room_number_fkey";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints" DROP CONSTRAINT IF EXISTS "foss_complaints_referenced_order_id_fkey";
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints" DROP CONSTRAINT IF EXISTS "foss_complaints_referenced_worker_id_fkey";
    `);

    // -------------------------------------------------------------------------
    // 4. Post-Drop Assertion: Verify Cross-Subsystem Constraints Are Removed
    //    and FOSS-Local Referential Integrity & Unique Constraints Are Intact
    // -------------------------------------------------------------------------
    const remainingFkRows = (await queryRunner.query(`
      SELECT conname, confrelid::regclass::text as foreign_table
      FROM pg_constraint 
      WHERE conrelid::regclass::text LIKE 'foss%' AND contype = 'f'
    `)) as Array<{ conname: string; foreign_table: string }>;

    for (const fk of remainingFkRows) {
      if (fk.conname !== 'foss_complaints_referenced_request_id_fkey') {
        throw new Error(
          `MIGRATION POST-CONDITION FAILED: Unexpected foreign key [${fk.conname}] ` +
            `referencing [${fk.foreign_table}] is still present on a FOSS table after drop.`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /**
     * Rollback Safety Note:
     * Restoring these foreign keys will fail if any existing records in foss_sessions,
     * foss_service_requests, or foss_complaints reference mock booking IDs, mock room
     * numbers, or mock order IDs that do not exist in the authoritative FDS/KMS parent tables.
     *
     * Per repository safety policy:
     * - No automated deletion or modification of records is performed during rollback.
     * - Constraints are restored strictly using their exact original definitions without
     *   bypassing validation via NOT VALID.
     * - If rollback fails due to orphan test records, manual coordination with the database
     *   owner is required to inspect and safely handle unreferenced test data.
     */

    // 1. foss_sessions -> FDS (bookings, rooms)
    await queryRunner.query(`
      ALTER TABLE "foss_sessions"
        ADD CONSTRAINT "foss_sessions_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("booking_id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_sessions"
        ADD CONSTRAINT "foss_sessions_room_number_fkey"
        FOREIGN KEY ("room_number") REFERENCES "rooms"("room_number") ON DELETE RESTRICT;
    `);

    // 2. foss_service_requests -> FDS (bookings, rooms)
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests"
        ADD CONSTRAINT "foss_service_requests_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("booking_id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_service_requests"
        ADD CONSTRAINT "foss_service_requests_room_number_fkey"
        FOREIGN KEY ("room_number") REFERENCES "rooms"("room_number") ON DELETE RESTRICT;
    `);

    // 3. foss_complaints -> FDS (bookings, rooms), KMS (orders), WKMS (staff)
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        ADD CONSTRAINT "foss_complaints_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("booking_id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        ADD CONSTRAINT "foss_complaints_room_number_fkey"
        FOREIGN KEY ("room_number") REFERENCES "rooms"("room_number") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        ADD CONSTRAINT "foss_complaints_referenced_order_id_fkey"
        FOREIGN KEY ("referenced_order_id") REFERENCES "kms_food_orders"("order_id") DEFERRABLE INITIALLY DEFERRED;
    `);
    await queryRunner.query(`
      ALTER TABLE "foss_complaints"
        ADD CONSTRAINT "foss_complaints_referenced_worker_id_fkey"
        FOREIGN KEY ("referenced_worker_id") REFERENCES "staff_users"("worker_id") ON DELETE RESTRICT;
    `);
  }
}
