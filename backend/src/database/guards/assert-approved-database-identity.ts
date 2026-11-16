import type { DataSource } from 'typeorm';

export interface DatabaseIdentitySettings {
  projectId?: string;
  branchId?: string;
  endpointId?: string;
}

/**
 * Asserts that the active DataSource is connected to the explicitly approved Neon test branch.
 *
 * Enforces fail-closed safety:
 * 1. Checks that APPROVED_NEON_PROJECT_ID, APPROVED_NEON_TEST_BRANCH_ID, and
 *    APPROVED_NEON_TEST_ENDPOINT_ID are all non-empty.
 * 2. Queries server-authoritative pg_settings for neon.project_id, neon.branch_id, and neon.endpoint_id.
 * 3. Explicitly rejects parent dev branch (PARENT_DEV_BRANCH_ID) or production.
 * 4. Requires exact equality between server-provided settings and approved test configuration.
 *
 * Runs automatically on DataSource.initialize() before any migration DDL or typeorm_migrations table creation.
 */
export async function assertApprovedDatabaseIdentity(
  dataSource: DataSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DatabaseIdentitySettings> {
  const approvedProjectId = env.APPROVED_NEON_PROJECT_ID;
  const approvedTestBranchId = env.APPROVED_NEON_TEST_BRANCH_ID;
  const approvedTestEndpointId = env.APPROVED_NEON_TEST_ENDPOINT_ID;
  const parentDevBranchId = env.PARENT_DEV_BRANCH_ID;

  if (!approvedProjectId || !approvedTestBranchId || !approvedTestEndpointId) {
    throw new Error(
      'MIGRATION SAFETY GATE BLOCKED: Server-side configuration is incomplete. ' +
        'APPROVED_NEON_PROJECT_ID, APPROVED_NEON_TEST_BRANCH_ID, and APPROVED_NEON_TEST_ENDPOINT_ID ' +
        'must all be configured before TypeORM can initialize or execute migrations.',
    );
  }

  const rows = (await dataSource.query(`
    SELECT name, setting 
    FROM pg_settings 
    WHERE name IN ('neon.project_id', 'neon.branch_id', 'neon.endpoint_id')
  `)) as Array<{ name: string; setting: string }>;

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.name] = row.setting;
  }

  const observedProjectId = settings['neon.project_id'];
  const observedBranchId = settings['neon.branch_id'];
  const observedEndpointId = settings['neon.endpoint_id'];

  if (parentDevBranchId && observedBranchId === parentDevBranchId) {
    throw new Error(
      `MIGRATION SAFETY GATE BLOCKED: Active database connection is on the parent dev branch [${observedBranchId}]! ` +
        'Refusing to initialize DataSource or execute migrations against shared parent dev or production.',
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
        'Refusing to initialize DataSource or execute migrations against unknown or unapproved database target.',
    );
  }

  return {
    projectId: observedProjectId,
    branchId: observedBranchId,
    endpointId: observedEndpointId,
  };
}
