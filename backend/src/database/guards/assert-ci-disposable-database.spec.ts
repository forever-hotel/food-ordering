import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { assertCiDisposableDatabase } from './assert-ci-disposable-database.js';

describe('assertCiDisposableDatabase', () => {
  let mockDataSource: { query: jest.Mock; options: Record<string, unknown> };

  beforeEach(() => {
    mockDataSource = {
      options: {
        type: 'postgres',
        host: '127.0.0.1',
        database: 'foss_test',
        port: 5432,
      },
      query: jest.fn().mockImplementation(async (sql: unknown) => {
        const queryStr = String(sql);

        // 1. Server info query
        if (queryStr.includes('current_database()')) {
          return [
            {
              db_name: 'foss_test',
              server_addr: '127.0.0.1',
              client_addr: '127.0.0.1',
              pg_version: 'PostgreSQL 16.4 on x86_64-pc-linux-musl',
            },
          ];
        }

        // 2. Neon settings query
        if (queryStr.includes('FROM pg_settings')) {
          return [];
        }

        // 3. Shared tables query
        if (queryStr.includes('FROM information_schema.tables')) {
          return [];
        }

        return [];
      }) as any,
    };
  });

  it('accepts a genuine, fresh disposable local PostgreSQL CI database', async () => {
    const result = await assertCiDisposableDatabase(
      mockDataSource as unknown as DataSource,
    );

    expect(result.isDisposableLocal).toBe(true);
    expect(result.databaseName).toBe('foss_test');
    expect(result.serverAddr).toBe('127.0.0.1');
    expect(result.pgVersion).toContain('PostgreSQL 16');
  });

  it('accepts loopback socket connections where server_addr is null', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: null,
            client_addr: null,
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      return [];
    });

    const result = await assertCiDisposableDatabase(
      mockDataSource as unknown as DataSource,
    );

    expect(result.isDisposableLocal).toBe(true);
    expect(result.serverAddr).toBe('unix_socket');
  });

  it('accepts localhost as valid loopback host in connection options or URL', async () => {
    mockDataSource.options = {
      type: 'postgres',
      url: 'postgresql://postgres:postgres@localhost:5432/foss_test',
    };

    const result = await assertCiDisposableDatabase(
      mockDataSource as unknown as DataSource,
    );
    expect(result.isDisposableLocal).toBe(true);
  });

  it('accepts a disposable PostgreSQL database running in a Docker container on the CI runner', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: '172.18.0.2/32', // Docker bridge container IP with CIDR
            client_addr: '172.18.0.1/32',
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      if (queryStr.includes('FROM pg_settings')) {
        return [];
      }
      if (queryStr.includes('FROM information_schema.tables')) {
        return [];
      }
      return [];
    });

    const result = await assertCiDisposableDatabase(
      mockDataSource as unknown as DataSource,
    );

    expect(result.isDisposableLocal).toBe(true);
    expect(result.serverAddr).toBe('172.18.0.2/32');
  });

  it('fails closed when host is a remote hostname', async () => {
    mockDataSource.options.host = 'remote-postgres.internal.hotel.com';

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Non-local host detected/,
    );
  });

  it('fails closed when host is a remote Neon database endpoint', async () => {
    mockDataSource.options.url =
      'postgresql://user:pass@ep-falling-fog-12345.c-3.ap-southeast-1.aws.neon.tech/foss_test?sslmode=require';

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Non-local host detected/,
    );
  });

  it('fails closed when database name is production or shared (e.g. forever)', async () => {
    mockDataSource.options.database = 'forever';

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Forbidden or non-test database name \[forever\]/,
    );
  });

  it('fails closed when database name is postgres default database', async () => {
    mockDataSource.options.database = 'postgres';

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Forbidden or non-test database name \[postgres\]/,
    );
  });

  it('fails closed when database name is forever_dev', async () => {
    mockDataSource.options.database = 'forever_dev';

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Forbidden or non-test database name \[forever_dev\]/,
    );
  });

  it('fails closed when server reports a non-loopback server IP address', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: '54.238.10.15/32', // Remote AWS / Neon IP
            client_addr: '127.0.0.1',
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      return [];
    });

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Non-loopback\/non-local server IP detected \[54\.238\.10\.15\/32\]/,
    );
  });

  it('fails closed when server reports a non-loopback client IP address', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: '127.0.0.1',
            client_addr: '54.238.10.15/32', // Remote AWS / Neon IP
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      return [];
    });

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Non-loopback\/non-local client IP detected \[54\.238\.10\.15\/32\]/,
    );
  });

  it('fails closed when Neon platform settings are detected on server', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: '127.0.0.1',
            client_addr: '127.0.0.1',
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      if (queryStr.includes('FROM pg_settings')) {
        return [
          { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
          { name: 'neon.branch_id', setting: 'br-restless-snow-azy30cdi' },
        ];
      }
      return [];
    });

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Neon cloud database settings detected on server/,
    );
  });

  it('fails closed when shared subsystem tables exist in the database', async () => {
    mockDataSource.query.mockImplementation(async (sql: unknown) => {
      const queryStr = String(sql);
      if (queryStr.includes('current_database()')) {
        return [
          {
            db_name: 'foss_test',
            server_addr: '127.0.0.1',
            client_addr: '127.0.0.1',
            pg_version: 'PostgreSQL 16.4',
          },
        ];
      }
      if (queryStr.includes('FROM information_schema.tables')) {
        return [{ table_name: 'bookings' }, { table_name: 'rooms' }];
      }
      return [];
    });

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Shared hotel subsystem tables detected \[bookings, rooms\]/,
    );
  });

  it('fails closed when database query throws an error', async () => {
    mockDataSource.query.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await expect(
      assertCiDisposableDatabase(mockDataSource as unknown as DataSource),
    ).rejects.toThrow(
      /CI MIGRATION SAFETY GATE BLOCKED: Failed to query database server connection properties/,
    );
  });
});
