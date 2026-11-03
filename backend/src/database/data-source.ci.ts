import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { assertCiDisposableDatabase } from './guards/assert-ci-disposable-database.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to initialize the CI TypeORM DataSource.',
  );
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const normalizePath = (value: string): string => value.replaceAll('\\', '/');

/**
 * Dedicated TypeORM DataSource for CI automated test migrations.
 *
 * In accordance with Section 4 restrictions and issue #101 requirements:
 * - This entrypoint is strictly dedicated to CI and verified disposable local testing.
 * - It hooks DataSource.initialize to automatically run assertCiDisposableDatabase.
 * - Rejects any remote, shared, or Neon cloud database target.
 * - If the safety assertion fails, cleanly destroys the connection before re-throwing.
 */
const CiAppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,

  synchronize: false,
  migrationsRun: false,

  entities: [
    normalizePath(join(currentDirectory, '..', '**', '*.entity.{ts,js}')),
  ],

  migrations: [
    normalizePath(join(currentDirectory, 'migrations', '*.{ts,js}')),
  ],

  migrationsTableName: 'typeorm_migrations',
  migrationsTransactionMode: 'each',
});

const originalInitialize = CiAppDataSource.initialize.bind(CiAppDataSource);
CiAppDataSource.initialize = async function (): Promise<DataSource> {
  const initializedDataSource = await originalInitialize();
  try {
    (
      initializedDataSource as unknown as Record<string, unknown>
    ).isCiDisposableRunner = true;
    await assertCiDisposableDatabase(initializedDataSource);
    return initializedDataSource;
  } catch (error) {
    if (initializedDataSource.isInitialized) {
      await initializedDataSource.destroy().catch(() => {});
    }
    throw error;
  }
};

export default CiAppDataSource;
