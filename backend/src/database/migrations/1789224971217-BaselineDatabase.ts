import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline database migration with fail-closed Neon identity gate.
 *
 * Runs as the very first migration in the TypeORM sequence.
 * Verifies that the active connection is strictly the approved dedicated Neon test child branch,
 * and explicitly aborts execution before any subsequent migration can touch the database if
 * connected to parent dev, production, unknown, or unapproved database targets.
 */
export class BaselineDatabase1789224971217 implements MigrationInterface {
  name = 'BaselineDatabase1789224971217';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
