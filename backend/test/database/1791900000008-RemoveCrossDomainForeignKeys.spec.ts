import { jest } from '@jest/globals';
import { RemoveCrossDomainForeignKeys1791900000008 } from '../../src/database/migrations/1791900000008-RemoveCrossDomainForeignKeys.js';
import type { QueryRunner, DataSource } from 'typeorm';

describe('RemoveCrossDomainForeignKeys1791900000008', () => {
  let migration: RemoveCrossDomainForeignKeys1791900000008;
  let mockQueryRunner: Partial<QueryRunner>;
  let mockConnection: Partial<DataSource>;
  let executedQueries: string[];

  const ORIGINAL_ENV = process.env;

  const VALID_CATALOG_ROWS = [
    {
      table_name: 'foss_sessions',
      constraint_name: 'foss_sessions_booking_id_fkey',
      foreign_table_name: 'bookings',
      definition:
        'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_sessions',
      constraint_name: 'foss_sessions_room_number_fkey',
      foreign_table_name: 'rooms',
      definition:
        'FOREIGN KEY (room_number) REFERENCES rooms(room_number) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_service_requests',
      constraint_name: 'foss_service_requests_booking_id_fkey',
      foreign_table_name: 'bookings',
      definition:
        'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_service_requests',
      constraint_name: 'foss_service_requests_room_number_fkey',
      foreign_table_name: 'rooms',
      definition:
        'FOREIGN KEY (room_number) REFERENCES rooms(room_number) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_complaints',
      constraint_name: 'foss_complaints_booking_id_fkey',
      foreign_table_name: 'bookings',
      definition:
        'FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_complaints',
      constraint_name: 'foss_complaints_room_number_fkey',
      foreign_table_name: 'rooms',
      definition:
        'FOREIGN KEY (room_number) REFERENCES rooms(room_number) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_complaints',
      constraint_name: 'foss_complaints_referenced_order_id_fkey',
      foreign_table_name: 'kms_food_orders',
      definition:
        'FOREIGN KEY (referenced_order_id) REFERENCES kms_food_orders(order_id) DEFERRABLE INITIALLY DEFERRED',
    },
    {
      table_name: 'foss_complaints',
      constraint_name: 'foss_complaints_referenced_worker_id_fkey',
      foreign_table_name: 'staff_users',
      definition:
        'FOREIGN KEY (referenced_worker_id) REFERENCES staff_users(worker_id) ON DELETE RESTRICT',
    },
    {
      table_name: 'foss_complaints',
      constraint_name: 'foss_complaints_referenced_request_id_fkey',
      foreign_table_name: 'foss_service_requests',
      definition:
        'FOREIGN KEY (referenced_request_id) REFERENCES foss_service_requests(request_id) ON DELETE RESTRICT',
    },
  ];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.APPROVED_NEON_PROJECT_ID = 'weathered-voice-13361247';
    process.env.APPROVED_NEON_TEST_BRANCH_ID = 'br-restless-snow-azy30cdi';
    process.env.APPROVED_NEON_TEST_ENDPOINT_ID = 'ep-falling-fog-aznexhri';
    process.env.PARENT_DEV_BRANCH_ID = 'br-cold-band-az0cv5vx';

    executedQueries = [];
    mockConnection = {
      query: jest.fn().mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        if (queryStr.includes('FROM pg_settings')) {
          return [
            { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
            { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
            { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
          ];
        }
        return [];
      }) as any,
    };

    mockQueryRunner = {
      connection: mockConnection as DataSource,
      query: jest.fn().mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        executedQueries.push(queryStr);
        if (queryStr.includes("WHERE conrelid::regclass::text LIKE 'foss%'")) {
          // If called before drop (contains SELECT conname, confrelid), return catalog rows
          if (queryStr.includes('pg_get_constraintdef')) {
            return VALID_CATALOG_ROWS;
          }
          // Post-drop query: only local constraint remains
          return [
            {
              conname: 'foss_complaints_referenced_request_id_fkey',
              foreign_table: 'foss_service_requests',
            },
          ];
        }
        return [];
      }) as any,
    };

    migration = new RemoveCrossDomainForeignKeys1791900000008();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails closed if Neon identity verification fails', async () => {
    delete process.env.APPROVED_NEON_TEST_BRANCH_ID;
    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Server-side configuration is incomplete/,
    );
  });

  it('fails closed if local FOSS constraint is missing from catalog', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        if (queryStr.includes('pg_get_constraintdef')) {
          // Exclude local constraint
          return VALID_CATALOG_ROWS.filter(
            (r) =>
              r.constraint_name !==
              'foss_complaints_referenced_request_id_fkey',
          );
        }
        return [];
      }) as any;

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION PRECONDITION FAILED: Local FOSS constraint \[foss_complaints_referenced_request_id_fkey\] was not found/,
    );
  });

  it('fails closed if any of the eight cross-subsystem foreign keys is missing', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        if (queryStr.includes('pg_get_constraintdef')) {
          // Exclude one of the required cross-subsystem constraints
          return VALID_CATALOG_ROWS.filter(
            (r) =>
              r.constraint_name !== 'foss_complaints_referenced_order_id_fkey',
          );
        }
        return [];
      }) as any;

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION PRECONDITION FAILED: Expected foreign key constraint \[foss_complaints_referenced_order_id_fkey\] was not found/,
    );
  });

  it('fails closed if constraint definition has unexpected mismatch', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        if (queryStr.includes('pg_get_constraintdef')) {
          return VALID_CATALOG_ROWS.map((r) =>
            r.constraint_name === 'foss_sessions_booking_id_fkey'
              ? {
                  ...r,
                  definition:
                    'FOREIGN KEY (booking_id) REFERENCES wrong_table(id)',
                }
              : r,
          );
        }
        return [];
      }) as any;

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION PRECONDITION FAILED: Constraint \[foss_sessions_booking_id_fkey\] definition mismatch/,
    );
  });

  it('drops exactly the eight validated cross-subsystem foreign keys when all preconditions pass', async () => {
    await migration.up(mockQueryRunner as QueryRunner);

    const dropQueries = executedQueries.filter((q) =>
      q.includes('DROP CONSTRAINT'),
    );
    expect(dropQueries).toHaveLength(8);

    expect(
      dropQueries.some((q) => q.includes('foss_sessions_booking_id_fkey')),
    ).toBe(true);
    expect(
      dropQueries.some((q) => q.includes('foss_sessions_room_number_fkey')),
    ).toBe(true);
    expect(
      dropQueries.some((q) =>
        q.includes('foss_service_requests_booking_id_fkey'),
      ),
    ).toBe(true);
    expect(
      dropQueries.some((q) =>
        q.includes('foss_service_requests_room_number_fkey'),
      ),
    ).toBe(true);
    expect(
      dropQueries.some((q) => q.includes('foss_complaints_booking_id_fkey')),
    ).toBe(true);
    expect(
      dropQueries.some((q) => q.includes('foss_complaints_room_number_fkey')),
    ).toBe(true);
    expect(
      dropQueries.some((q) =>
        q.includes('foss_complaints_referenced_order_id_fkey'),
      ),
    ).toBe(true);
    expect(
      dropQueries.some((q) =>
        q.includes('foss_complaints_referenced_worker_id_fkey'),
      ),
    ).toBe(true);

    // Verify local constraint was NOT dropped
    expect(
      dropQueries.some((q) =>
        q.includes('foss_complaints_referenced_request_id_fkey'),
      ),
    ).toBe(false);
  });

  it('fails post-condition check if unexpected foreign keys remain on FOSS tables after drop', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);
        if (queryStr.includes('pg_get_constraintdef')) {
          return VALID_CATALOG_ROWS;
        }
        if (
          queryStr.includes(
            "WHERE conrelid::regclass::text LIKE 'foss%' AND contype = 'f'",
          )
        ) {
          // Return unexpected remaining FK
          return [
            {
              conname: 'foss_complaints_referenced_request_id_fkey',
              foreign_table: 'foss_service_requests',
            },
            {
              conname: 'unexpected_external_fk',
              foreign_table: 'external_table',
            },
          ];
        }
        return [];
      }) as any;

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION POST-CONDITION FAILED: Unexpected foreign key \[unexpected_external_fk\]/,
    );
  });

  it('down() restores the eight exact foreign-key constraints without any DELETE queries', async () => {
    await migration.down(mockQueryRunner as QueryRunner);

    const addConstraintQueries = executedQueries.filter((q) =>
      q.includes('ADD CONSTRAINT'),
    );
    expect(addConstraintQueries).toHaveLength(8);

    const deleteQueries = executedQueries.filter((q) =>
      q.toUpperCase().includes('DELETE FROM'),
    );
    expect(deleteQueries).toHaveLength(0);

    const notValidQueries = executedQueries.filter((q) =>
      q.toUpperCase().includes('NOT VALID'),
    );
    expect(notValidQueries).toHaveLength(0);
  });
});
