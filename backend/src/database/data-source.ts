import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { assertApprovedDatabaseIdentity } from './guards/assert-approved-database-identity.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to initialize the TypeORM DataSource.',
  );
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const normalizePath = (value: string): string => value.replaceAll('\\', '/');

const AppDataSource = new DataSource({
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

// Hook DataSource.initialize to automatically run the fail-closed Neon identity guard
// before any migration DDL, history table creation, or schema operations can occur.
// If the identity assertion fails, destroy the initialized connection cleanly before re-throwing.
const originalInitialize = AppDataSource.initialize.bind(AppDataSource);
AppDataSource.initialize = async function (): Promise<DataSource> {
  const initializedDataSource = await originalInitialize();
  try {
    await assertApprovedDatabaseIdentity(initializedDataSource);
    return initializedDataSource;
  } catch (error) {
    if (initializedDataSource.isInitialized) {
      await initializedDataSource.destroy().catch(() => {});
    }
    throw error;
  }
};

export default AppDataSource;
