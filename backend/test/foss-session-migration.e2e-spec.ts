import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { CreateFossSessions1791900000000 } from '../src/database/migrations/1791900000000-CreateFossSessions.js';
import { FossSession } from '../src/modules/guest-sessions/entities/foss-session.entity.js';

describe('FOSSSession migration (e2e)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  const migration = new CreateFossSessions1791900000000();

  const testSchema = `foss_migration_test_${randomUUID().replaceAll('-', '')}`;

  const createSession = () => ({
    bookingId: randomUUID(),
    roomNumber: '101',
    sessionToken: randomUUID(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL must be configured.');
    }

    const databaseName = new URL(databaseUrl).pathname.slice(1);

    if (!databaseName.endsWith('_test')) {
      throw new Error('Migration tests require a disposable _test database.');
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [FossSession],
      synchronize: false,
      migrationsRun: false,
    });

    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    await queryRunner.query(`CREATE SCHEMA "${testSchema}"`);
    await queryRunner.query(`SET search_path TO "${testSchema}", public`);

    await migration.up(queryRunner);
  });

  beforeEach(async () => {
    await queryRunner.query('TRUNCATE TABLE "foss_sessions"');
  });

  afterAll(async () => {
    if (queryRunner && !queryRunner.isReleased) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await queryRunner.release();
    }

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('creates the foss_sessions table', async () => {
    const rows: Array<{ table_name: string }> = await queryRunner.query(`
        SELECT to_regclass('foss_sessions')::text AS table_name
      `);

    expect(rows[0]?.table_name).toBe('foss_sessions');
  });

  it('creates all expected database columns', async () => {
    const rows: Array<{ column_name: string }> = await queryRunner.query(
      `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'foss_sessions'
          ORDER BY ordinal_position
        `,
      [testSchema],
    );

    expect(rows.map((row) => row.column_name)).toEqual([
      'session_id',
      'booking_id',
      'room_number',
      'session_token',
      'is_active',
      'created_at',
      'updated_at',
      'expires_at',
    ]);
  });

  it('generates UUID and applies default values', async () => {
    const session = createSession();

    const rows = await queryRunner.query(
      `
        INSERT INTO "foss_sessions"
          ("booking_id", "room_number", "session_token", "expires_at")
        VALUES ($1, $2, $3, $4)
        RETURNING "session_id", "is_active", "created_at", "updated_at"
      `,
      [
        session.bookingId,
        session.roomNumber,
        session.sessionToken,
        session.expiresAt,
      ],
    );

    const row = rows[0] as {
      session_id: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    };

    expect(row.session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
    expect(row.is_active).toBe(true);
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it('rejects duplicate booking IDs', async () => {
    const repository = queryRunner.manager.getRepository(FossSession);
    const session = createSession();

    await repository.save(session);

    await expect(
      repository.save({
        ...createSession(),
        bookingId: session.bookingId,
      }),
    ).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });

  it('rejects duplicate session tokens', async () => {
    const repository = queryRunner.manager.getRepository(FossSession);
    const session = createSession();

    await repository.save(session);

    await expect(
      repository.save({
        ...createSession(),
        sessionToken: session.sessionToken,
      }),
    ).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });

  it('rejects missing required fields', async () => {
    const session = createSession();

    await expect(
      queryRunner.query(
        `
          INSERT INTO "foss_sessions"
            ("booking_id", "room_number", "session_token")
          VALUES ($1, $2, $3)
        `,
        [session.bookingId, session.roomNumber, session.sessionToken],
      ),
    ).rejects.toMatchObject({
      code: '23502',
    });
  });

  it('saves and retrieves a session using TypeORM', async () => {
    const repository = queryRunner.manager.getRepository(FossSession);
    const session = createSession();

    const saved = await repository.save(session);

    expect(saved.sessionId).toBeDefined();

    const found = await repository.findOne({
      where: { bookingId: session.bookingId },
    });

    expect(found?.bookingId).toBe(session.bookingId);
    expect(found?.roomNumber).toBe('101');
    expect(found?.isActive).toBe(true);
  });

  it('rolls back and reapplies the migration', async () => {
    // Remove the FOSSSession table from the isolated test schema.
    await migration.down(queryRunner);

    // Check the isolated schema explicitly.
    // Cast the parameter to TEXT so PostgreSQL can resolve its type.
    const removed: Array<{ table_name: string | null }> =
      await queryRunner.query(
        `
            SELECT to_regclass(
            format('%I.%I', $1::text, 'foss_sessions')
            )::text AS table_name
        `,
        [testSchema],
      );

    expect(removed[0].table_name).toBeNull();

    // Reapply the migration.
    await migration.up(queryRunner);

    // Verify the table exists again in the isolated test schema.
    const restored: Array<{ table_name: string | null }> =
      await queryRunner.query(
        `
            SELECT to_regclass(
            format('%I.%I', $1::text, 'foss_sessions')
            )::text AS table_name
        `,
        [testSchema],
      );

    expect(restored[0].table_name).toBe('foss_sessions');
  });
});
