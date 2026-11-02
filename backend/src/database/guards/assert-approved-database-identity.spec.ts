import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { assertApprovedDatabaseIdentity } from './assert-approved-database-identity.js';

describe('assertApprovedDatabaseIdentity', () => {
  let mockDataSource: Partial<DataSource>;

  const VALID_CONFIG = {
    APPROVED_NEON_PROJECT_ID: 'weathered-voice-13361247',
    APPROVED_NEON_TEST_BRANCH_ID: 'br-restless-snow-azy30cdi',
    APPROVED_NEON_TEST_ENDPOINT_ID: 'ep-falling-fog-aznexhri',
    PARENT_DEV_BRANCH_ID: 'br-cold-band-az0cv5vx',
  };

  const VALID_SETTINGS_ROWS = [
    { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
    { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
    { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
  ];

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM pg_settings')) {
          return VALID_SETTINGS_ROWS;
        }
        return [];
      }) as any,
    };
  });

  it('fails closed when APPROVED_NEON_PROJECT_ID is missing', async () => {
    const env = { ...VALID_CONFIG, APPROVED_NEON_PROJECT_ID: '' };
    await expect(
      assertApprovedDatabaseIdentity(mockDataSource as DataSource, env),
    ).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Server-side configuration is incomplete/,
    );
  });

  it('fails closed when APPROVED_NEON_TEST_BRANCH_ID is missing', async () => {
    const env = { ...VALID_CONFIG, APPROVED_NEON_TEST_BRANCH_ID: '' };
    await expect(
      assertApprovedDatabaseIdentity(mockDataSource as DataSource, env),
    ).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Server-side configuration is incomplete/,
    );
  });

  it('fails closed when APPROVED_NEON_TEST_ENDPOINT_ID is missing', async () => {
    const env = { ...VALID_CONFIG, APPROVED_NEON_TEST_ENDPOINT_ID: '' };
    await expect(
      assertApprovedDatabaseIdentity(mockDataSource as DataSource, env),
    ).rejects.toThrow(
      /MIGRATION SAFETY GATE BLOCKED: Server-side configuration is incomplete/,
    );
  });

  it('fails closed if the active connection is on the parent dev branch', async () => {
    mockDataSource.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-cold-band-az0cv5vx' },
      { name: 'neon.endpoint_id', setting: 'ep-cold-endpoint' },
    ]) as any;

    await expect(
      assertApprovedDatabaseIdentity(
        mockDataSource as DataSource,
        VALID_CONFIG,
      ),
    ).rejects.toThrow(/Active database connection is on the parent dev branch/);
  });

  it('fails closed if observed project ID does not match allowlist', async () => {
    mockDataSource.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'wrong-project-id' },
      { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
      { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
    ]) as any;

    await expect(
      assertApprovedDatabaseIdentity(
        mockDataSource as DataSource,
        VALID_CONFIG,
      ),
    ).rejects.toThrow(/Neon branch identity verification failed/);
  });

  it('fails closed if observed branch ID does not match allowlist', async () => {
    mockDataSource.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-different-branch' },
      { name: 'neon.endpoint_id', setting: 'ep-falling-fog-aznexhri' },
    ]) as any;

    await expect(
      assertApprovedDatabaseIdentity(
        mockDataSource as DataSource,
        VALID_CONFIG,
      ),
    ).rejects.toThrow(/Neon branch identity verification failed/);
  });

  it('fails closed if observed endpoint ID does not match allowlist', async () => {
    mockDataSource.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
      { name: 'neon.endpoint_id', setting: 'ep-wrong-endpoint' },
    ]) as any;

    await expect(
      assertApprovedDatabaseIdentity(
        mockDataSource as DataSource,
        VALID_CONFIG,
      ),
    ).rejects.toThrow(/Neon branch identity verification failed/);
  });

  it('succeeds and returns verified settings when all IDs match the approved test branch', async () => {
    const result = await assertApprovedDatabaseIdentity(
      mockDataSource as DataSource,
      VALID_CONFIG,
    );
    expect(result).toEqual({
      projectId: 'weathered-voice-13361247',
      branchId: 'br-restless-snow-azy30cdi',
      endpointId: 'ep-falling-fog-aznexhri',
    });
  });

  it('regression: blocks an unapproved database connection even if all migrations are already completed', async () => {
    // Proves that DataSource runner enforcement is independent of migration state
    mockDataSource.query = jest.fn().mockResolvedValueOnce([
      { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
      { name: 'neon.branch_id', setting: 'br-unapproved-future-branch' },
      { name: 'neon.endpoint_id', setting: 'ep-unapproved-endpoint' },
    ]) as any;

    await expect(
      assertApprovedDatabaseIdentity(
        mockDataSource as DataSource,
        VALID_CONFIG,
      ),
    ).rejects.toThrow(/Neon branch identity verification failed/);
  });
});
