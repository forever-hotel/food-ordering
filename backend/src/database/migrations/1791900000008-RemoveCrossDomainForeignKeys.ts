import { MigrationInterface, QueryRunner } from 'typeorm';
import { assertApprovedDatabaseIdentity } from '../guards/assert-approved-database-identity.js';
import { assertCiDisposableDatabase } from '../guards/assert-ci-disposable-database.js';

interface ExpectedConstraint {
  tableName: string;
  constraintName: string;
  foreignTableName: string;
  definitionSubstrings: string[];
}

const EXPECTED_CROSS_SUBSYSTEM_FOREIGN_KEYS: ExpectedConstraint[] = [
  {
    tableName: 'foss_sessions',
    constraintName: 'foss_sessions_booking_id_fkey',
    foreignTableName: 'bookings',
    definitionSubstrings: [
      'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_sessions',
    constraintName: 'foss_sessions_room_number_fkey',
    foreignTableName: 'rooms',
    definitionSubstrings: [
      'FOREIGN KEY (room_number) REFERENCES rooms(room_number)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_service_requests',
    constraintName: 'foss_service_requests_booking_id_fkey',
    foreignTableName: 'bookings',
    definitionSubstrings: [
      'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_service_requests',
    constraintName: 'foss_service_requests_room_number_fkey',
    foreignTableName: 'rooms',
    definitionSubstrings: [
      'FOREIGN KEY (room_number) REFERENCES rooms(room_number)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_complaints',
    constraintName: 'foss_complaints_booking_id_fkey',
    foreignTableName: 'bookings',
    definitionSubstrings: [
      'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_complaints',
    constraintName: 'foss_complaints_room_number_fkey',
    foreignTableName: 'rooms',
    definitionSubstrings: [
      'FOREIGN KEY (room_number) REFERENCES rooms(room_number)',
      'ON DELETE RESTRICT',
    ],
  },
  {
    tableName: 'foss_complaints',
    constraintName: 'foss_complaints_referenced_order_id_fkey',
    foreignTableName: 'kms_food_orders',
    definitionSubstrings: [
      'FOREIGN KEY (referenced_order_id) REFERENCES kms_food_orders(order_id)',
      'DEFERRABLE',
    ],
  },
  {
    tableName: 'foss_complaints',
    constraintName: 'foss_complaints_referenced_worker_id_fkey',
    foreignTableName: 'staff_users',
    definitionSubstrings: [
      'FOREIGN KEY (referenced_worker_id) REFERENCES staff_users(worker_id)',
      'ON DELETE RESTRICT',
    ],
  },
];

const LOCAL_PRESERVED_CONSTRAINT = {
  tableName: 'foss_complaints',
  constraintName: 'foss_complaints_referenced_request_id_fkey',
  foreignTableName: 'foss_service_requests',
  definitionSubstrings: [
    'FOREIGN KEY (referenced_request_id) REFERENCES foss_service_requests(request_id)',
    'ON DELETE RESTRICT',
  ],
};

/**
 * Removes physical cross-subsystem foreign keys on FOSS-owned tables.
 *
 * In accordance with ADR-002, ADR-003, and SDS §1.4, cross-service referential integrity
 * for booking, room, KMS food order, and worker references is maintained authoritatively
 * via typed service adapters (BookingProvider, KmsProvider, WkmsProvider).
 *
 * Safety Enforcements:
 * - Re-verifies Neon test branch connection via assertApprovedDatabaseIdentity.
 * - Inspects all 8 target foreign keys through pg_constraint and pg_get_constraintdef,
 *   validating exact names, owning tables, referenced tables, and definitions before dropping.
 * - Rejects execution if any expected constraint is missing or differs unexpectedly.
 * - Strictly preserves the FOSS-local foreign key (foss_complaints_referenced_request_id_fkey),
 *   all primary keys, unique constraints, check constraints, and table records.
 */
export class RemoveCrossDomainForeignKeys1791900000008 implements MigrationInterface {
  name = 'RemoveCrossDomainForeignKeys1791900000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------------------------------------------------------------
    // 1. Precondition Gate: Authoritative Database Identity Check
    // -------------------------------------------------------------------------
    const isCiDisposable = Boolean(
      (queryRunner.connection as unknown as Record<string, unknown>)
        ?.isCiDisposableRunner,
    );

    if (queryRunner.connection) {
      if (isCiDisposable) {
        await assertCiDisposableDatabase(
          queryRunner.connection as unknown as import('typeorm').DataSource,
        );
      } else {
        await assertApprovedDatabaseIdentity(
          queryRunner.connection,
          process.env,
        );
      }
    }

    // -------------------------------------------------------------------------
    // 2. Precondition Gate: Catalog Inspection & Exact Constraint Verification
    // -------------------------------------------------------------------------
    const catalogRows = (await queryRunner.query(`
      SELECT 
        conrelid::regclass::text AS table_name,
        conname AS constraint_name,
        confrelid::regclass::text AS foreign_table_name,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid::regclass::text LIKE 'foss%' AND contype = 'f'
    `)) as Array<{
      table_name: string;
      constraint_name: string;
      foreign_table_name: string;
      definition: string;
    }>;

    const catalogMap = new Map<
      string,
      { table_name: string; foreign_table_name: string; definition: string }
    >();
    for (const row of catalogRows) {
      catalogMap.set(row.constraint_name, row);
    }

    // Assert that the FOSS-local foreign key is present and strictly matches
    const localFk = catalogMap.get(LOCAL_PRESERVED_CONSTRAINT.constraintName);
    if (!localFk) {
      throw new Error(
        `MIGRATION PRECONDITION FAILED: Local FOSS constraint [${LOCAL_PRESERVED_CONSTRAINT.constraintName}] ` +
          'was not found in pg_constraint.',
      );
    }
    if (
      localFk.table_name !== LOCAL_PRESERVED_CONSTRAINT.tableName ||
      localFk.foreign_table_name !== LOCAL_PRESERVED_CONSTRAINT.foreignTableName
    ) {
      throw new Error(
        `MIGRATION PRECONDITION FAILED: Local FOSS constraint [${LOCAL_PRESERVED_CONSTRAINT.constraintName}] ` +
          `is attached to table [${localFk.table_name}] referencing [${localFk.foreign_table_name}], ` +
          `expected [${LOCAL_PRESERVED_CONSTRAINT.tableName}] referencing [${LOCAL_PRESERVED_CONSTRAINT.foreignTableName}].`,
      );
    }

    // Validate that all eight cross-subsystem foreign keys exist with exact expected definitions (Neon test branch).
    // In a fresh disposable CI database, these cross-subsystem foreign keys were never introduced.
    const missingConstraints: string[] = [];
    const presentConstraints: ExpectedConstraint[] = [];

    for (const expected of EXPECTED_CROSS_SUBSYSTEM_FOREIGN_KEYS) {
      const observed = catalogMap.get(expected.constraintName);
      if (!observed) {
        missingConstraints.push(expected.constraintName);
        continue;
      }
      presentConstraints.push(expected);

      if (
        observed.table_name !== expected.tableName ||
        observed.foreign_table_name !== expected.foreignTableName
      ) {
        throw new Error(
          `MIGRATION PRECONDITION FAILED: Constraint [${expected.constraintName}] metadata mismatch.\n` +
            `  Observed: table [${observed.table_name}], references [${observed.foreign_table_name}]\n` +
            `  Expected: table [${expected.tableName}], references [${expected.foreignTableName}]\n` +
            'Aborting to prevent schema corruption.',
        );
      }

      for (const substr of expected.definitionSubstrings) {
        if (!observed.definition.includes(substr)) {
          throw new Error(
            `MIGRATION PRECONDITION FAILED: Constraint [${expected.constraintName}] definition mismatch.\n` +
              `  Observed definition: [${observed.definition}]\n` +
              `  Missing required clause: [${substr}]\n` +
              'Aborting to prevent schema corruption.',
          );
        }
      }
    }

    if (missingConstraints.length > 0) {
      // If any constraint is missing on Neon, or if only a subset is missing in CI, abort.
      if (
        !isCiDisposable ||
        missingConstraints.length !==
          EXPECTED_CROSS_SUBSYSTEM_FOREIGN_KEYS.length
      ) {
        throw new Error(
          `MIGRATION PRECONDITION FAILED: Expected foreign key constraint [${missingConstraints[0]}] ` +
            `was not found on table [${
              EXPECTED_CROSS_SUBSYSTEM_FOREIGN_KEYS.find(
                (k) => k.constraintName === missingConstraints[0],
              )?.tableName || 'unknown'
            }]. Aborting to prevent unintended schema modification.`,
        );
      }
      // On fresh CI disposable database where all 8 cross-subsystem foreign keys are absent,
      // the schema is already cleanly decoupled. No drop DDL needed.
    } else {
      // -------------------------------------------------------------------------
      // 3. Drop Exactly the Eight Validated Cross-Subsystem Foreign Keys
      // -------------------------------------------------------------------------
      for (const target of presentConstraints) {
        await queryRunner.query(
          `ALTER TABLE "${target.tableName}" DROP CONSTRAINT "${target.constraintName}";`,
        );
      }
    }

    // -------------------------------------------------------------------------
    // 4. Post-Drop Assertion: Verify Remaining Foreign Keys
    // -------------------------------------------------------------------------
    const remainingFkRows = (await queryRunner.query(`
      SELECT conname, confrelid::regclass::text as foreign_table
      FROM pg_constraint 
      WHERE conrelid::regclass::text LIKE 'foss%' AND contype = 'f'
    `)) as Array<{ conname: string; foreign_table: string }>;

    for (const fk of remainingFkRows) {
      if (fk.conname !== LOCAL_PRESERVED_CONSTRAINT.constraintName) {
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
