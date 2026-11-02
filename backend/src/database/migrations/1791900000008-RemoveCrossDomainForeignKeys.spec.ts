import { jest } from '@jest/globals';
import { RemoveCrossDomainForeignKeys1791900000008 } from './1791900000008-RemoveCrossDomainForeignKeys.js';
import type { QueryRunner } from 'typeorm';

describe('RemoveCrossDomainForeignKeys1791900000008', () => {
  let migration: RemoveCrossDomainForeignKeys1791900000008;
  let mockQueryRunner: Partial<QueryRunner>;
  let executedQueries: string[];

  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.APPROVED_NEON_PROJECT_ID = 'weathered-voice-13361247';
    process.env.APPROVED_NEON_TEST_BRANCH_ID = 'br-restless-snow-azy30cdi';
    process.env.APPROVED_NEON_TEST_ENDPOINT_ID = 'ep-falling-fog-aznexhri';
    process.env.PARENT_DEV_BRANCH_ID = 'br-cold-band-az0cv5vx';

    executedQueries = [];
    mockQueryRunner = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('FROM pg_settings')) {
          return [
            { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
            { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
            { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
          ];
        }
        if (
          sql.includes("conname = 'foss_complaints_referenced_request_id_fkey'")
        ) {
          return [{ conname: 'foss_complaints_referenced_request_id_fkey' }];
        }
        if (sql.includes("WHERE conrelid::regclass::text LIKE 'foss%'")) {
          return [
            {
              conname: 'foss_complaints_referenced_request_id_fkey',
              foreign_table: 'foss_service_requests',
            },
          ];
        }
        return [];
      }),
    };

    migration = new RemoveCrossDomainForeignKeys1791900000008();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails closed if approved Neon configuration is missing', async () => {
    delete process.env.APPROVED_NEON_TEST_BRANCH_ID;
    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION PRECONDITION FAILED: APPROVED_NEON_PROJECT_ID.*must all be configured/,
    );
  });

  it('fails closed if connected to parent dev branch', async () => {
    mockQueryRunner.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-cold-band-az0cv5vx' },
      { name: 'neon.endpoint_id', setting: 'ep-cold-endpoint' },
    ]);

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Migration target is the parent dev branch/,
    );
  });

  it('fails closed if Neon branch metadata does not match approved test branch allowlist', async () => {
    mockQueryRunner.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-unknown-branch' },
      { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
    ]);

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Neon branch identity verification failed/,
    );
  });

  it('fails closed if local FOSS foreign key constraint is missing', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockResolvedValueOnce([
        { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
        { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
        { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
      ])
      .mockResolvedValueOnce([]); // local FK missing

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION PRECONDITION FAILED: Local FOSS constraint foss_complaints_referenced_request_id_fkey was not found/,
    );
  });

  it('drops exactly the eight approved cross-subsystem foreign keys when preconditions pass', async () => {
    await migration.up(mockQueryRunner as QueryRunner);

    // Verify 8 drop queries were executed
    const dropQueries = executedQueries.filter((q) =>
      q.includes('DROP CONSTRAINT IF EXISTS'),
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

    // Verify the FOSS-local foreign key was NOT dropped
    expect(
      dropQueries.some((q) =>
        q.includes('foss_complaints_referenced_request_id_fkey'),
      ),
    ).toBe(false);
  });

  it('fails post-condition check if unexpected foreign keys remain on FOSS tables', async () => {
    mockQueryRunner.query = jest
      .fn()
      .mockResolvedValueOnce([
        { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
        { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
        { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
      ])
      .mockResolvedValueOnce([
        { conname: 'foss_complaints_referenced_request_id_fkey' },
      ])
      .mockResolvedValueOnce([]) // drops
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          conname: 'foss_complaints_referenced_request_id_fkey',
          foreign_table: 'foss_service_requests',
        },
        {
          conname: 'unexpected_fk',
          foreign_table: 'external_table',
        },
      ]);

    await expect(migration.up(mockQueryRunner as QueryRunner)).rejects.toThrow(
      /MIGRATION POST-CONDITION FAILED: Unexpected foreign key \[unexpected_fk\]/,
    );
  });

  it('down() restores the eight exact foreign-key constraints without any DELETE queries', async () => {
    await migration.down(mockQueryRunner as QueryRunner);

    const addConstraintQueries = executedQueries.filter((q) =>
      q.includes('ADD CONSTRAINT'),
    );
    expect(addConstraintQueries).toHaveLength(8);

    // Verify no broad DELETE or data modification queries exist
    const deleteQueries = executedQueries.filter((q) =>
      q.toUpperCase().includes('DELETE FROM'),
    );
    expect(deleteQueries).toHaveLength(0);

    // Verify no NOT VALID bypass is used
    const notValidQueries = executedQueries.filter((q) =>
      q.toUpperCase().includes('NOT VALID'),
    );
    expect(notValidQueries).toHaveLength(0);
  });
});
