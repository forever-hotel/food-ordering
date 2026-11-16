import 'dotenv/config';
import CiAppDataSource from '../data-source.ci.js';

/**
 * Verification script for the disposable CI database target.
 *
 * Runs as step 3 in GitHub Actions Backend CI workflow before executing migrations.
 * Verifies that the connected database is a verified local disposable test instance.
 * Fails closed with exit code 1 if the database identity assertion fails.
 */
async function main(): Promise<void> {
  console.log(
    '[CI DB VERIFY] Initializing connection to verify disposable CI database target...',
  );

  try {
    const dataSource = await CiAppDataSource.initialize();
    console.log(
      '[CI DB VERIFY] ✓ Disposable CI database target successfully verified.',
    );
    await dataSource.destroy();
    process.exit(0);
  } catch (err) {
    console.error(
      '[CI DB VERIFY] ✗ Database safety gate failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

void main();
