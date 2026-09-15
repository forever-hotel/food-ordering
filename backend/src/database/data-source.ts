import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

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
});

export default AppDataSource;
