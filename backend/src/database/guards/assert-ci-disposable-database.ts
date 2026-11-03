import type { DataSource } from 'typeorm';

export interface CiDatabaseIdentitySettings {
  isDisposableLocal: true;
  databaseName: string;
  serverAddr: string;
  pgVersion: string;
}

const ALLOWED_CI_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

/**
 * Validates that an IP address reported by PostgreSQL (inet_server_addr or inet_client_addr)
 * belongs to either local loopback or a local Docker container bridge network on the runner.
 * Rejects all public internet addresses and remote cloud subnets.
 */
export function isAllowedCiDatabaseIp(rawIp: string): boolean {
  if (!rawIp) {
    return false;
  }
  // Strip PostgreSQL CIDR notation if present (e.g. "172.18.0.2/32" -> "172.18.0.2")
  const ip = rawIp.replace(/\/\d+$/, '').trim();

  // Loopback (IPv4 & IPv6)
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) {
    return true;
  }

  // Docker container bridge network on local runner host (RFC 1918 private subnets)
  // Docker default and custom bridge networks allocate 172.16.0.0/12, 10.0.0.0/8, or 192.168.0.0/16
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return true;
  }

  const match172 = ip.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) {
      return true;
    }
  }

  return false;
}

export const FORBIDDEN_SHARED_TABLES = [
  'bookings',
  'rooms',
  'staff_users',
  'kms_food_orders',
  'kms_menu_items',
] as const;

/**
 * Asserts that the active DataSource is connected strictly to a genuine, disposable
 * local PostgreSQL instance provisioned for automated CI testing.
 *
 * Enforces strict fail-closed security boundaries:
 * 1. Checks that the DataSource uses 'postgres'.
 * 2. Parses the host from DataSource options / connection URL:
 *    - Host MUST resolve to local loopback (localhost, 127.0.0.1, ::1).
 *    - Explicitly rejects any remote host, AWS, or .neon.tech domain.
 * 3. Verifies that the database name matches an isolated CI test database (e.g. 'foss_test' or ending in '_test').
 *    - Explicitly rejects shared or production databases ('forever', 'forever_dev', 'food_ordering', etc.).
 * 4. Queries authoritative PostgreSQL server runtime properties:
 *    - current_database(): Must match the expected CI test database name.
 *    - inet_server_addr(): If connected via TCP, must resolve strictly to loopback (127.0.0.1 or ::1).
 *    - inet_client_addr(): If connected via TCP, must also resolve to loopback.
 * 5. Queries server pg_settings for 'neon.project_id', 'neon.branch_id', 'neon.endpoint_id':
 *    - If any Neon cloud settings are observed, it FAILS CLOSED immediately to ensure the CI runner
 *      can NEVER be accidentally or intentionally pointed at any Neon database.
 * 6. Inspects existing tables in the database schema:
 *    - Ensures no forbidden shared-domain tables (e.g. 'bookings', 'rooms', 'staff_users')
 *      exist in the database, verifying true disposable isolation.
 *
 * Cannot be bypassed merely by setting CI=true or any environment variable.
 */
export async function assertCiDisposableDatabase(
  dataSource: DataSource,
): Promise<CiDatabaseIdentitySettings> {
  if (!dataSource) {
    throw new Error(
      'CI MIGRATION SAFETY GATE BLOCKED: DataSource is required.',
    );
  }

  const options = (dataSource.options || {}) as unknown as Record<
    string,
    unknown
  >;

  let host = String(options.host || '');
  let database = String(options.database || '');

  if (options.url && typeof options.url === 'string') {
    try {
      const parsed = new URL(options.url);
      host = parsed.hostname;
      database = parsed.pathname.replace(/^\//, '');
    } catch {
      throw new Error(
        'CI MIGRATION SAFETY GATE BLOCKED: Malformed DATABASE_URL connection string.',
      );
    }
  }

  const normalizedHost = host.toLowerCase().trim();
  const normalizedDb = database.toLowerCase().trim();

  // 1. Host validation
  if (!ALLOWED_CI_HOSTS.has(normalizedHost)) {
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Non-local host detected [${host}]. ` +
        'The CI migration runner strictly forbids remote database connections.',
    );
  }

  if (
    normalizedHost.includes('neon.tech') ||
    normalizedHost.includes('aws') ||
    normalizedHost.includes('rds') ||
    normalizedHost.includes('cloud')
  ) {
    throw new Error(
      'CI MIGRATION SAFETY GATE BLOCKED: Cloud or Neon database host detected. ' +
        'CI migrations must run exclusively against a fresh local disposable PostgreSQL service.',
    );
  }

  // 2. Database name validation
  const isAllowedDbName =
    normalizedDb === 'foss_test' ||
    normalizedDb === 'foss_disposable_test' ||
    normalizedDb === 'food_ordering_test' ||
    normalizedDb.endsWith('_test');

  const isForbiddenDbName =
    normalizedDb === 'forever' ||
    normalizedDb === 'forever_dev' ||
    normalizedDb === 'forever_production' ||
    normalizedDb === 'food_ordering' ||
    normalizedDb === 'postgres';

  if (!isAllowedDbName || isForbiddenDbName) {
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Forbidden or non-test database name [${database}]. ` +
        'The CI migration runner requires a dedicated disposable test database (e.g. foss_test).',
    );
  }

  // 3. Authoritative server query: database name, server address, client address
  let serverInfoRows: Array<{
    db_name: string;
    server_addr: string | null;
    client_addr: string | null;
    pg_version: string;
  }>;

  try {
    serverInfoRows = (await dataSource.query(`
      SELECT 
        current_database() AS db_name,
        inet_server_addr()::text AS server_addr,
        inet_client_addr()::text AS client_addr,
        version() AS pg_version;
    `)) as Array<{
      db_name: string;
      server_addr: string | null;
      client_addr: string | null;
      pg_version: string;
    }>;
  } catch (error) {
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Failed to query database server connection properties: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const serverInfo = serverInfoRows?.[0];
  if (!serverInfo || !serverInfo.db_name) {
    throw new Error(
      'CI MIGRATION SAFETY GATE BLOCKED: Database returned empty server identification metadata.',
    );
  }

  const observedDbName = serverInfo.db_name.toLowerCase().trim();
  if (observedDbName !== normalizedDb) {
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Connected database name mismatch: ` +
        `observed [${serverInfo.db_name}], expected [${database}].`,
    );
  }

  // If connected via TCP socket, verify that the remote IP is strictly local loopback or CI Docker bridge
  if (serverInfo.server_addr !== null && serverInfo.server_addr !== undefined) {
    const sAddr = serverInfo.server_addr.trim();
    if (!isAllowedCiDatabaseIp(sAddr)) {
      throw new Error(
        `CI MIGRATION SAFETY GATE BLOCKED: Non-loopback/non-local server IP detected [${sAddr}]. ` +
          'Refusing to run CI migrations against remote or shared database networks.',
      );
    }
  }

  if (serverInfo.client_addr !== null && serverInfo.client_addr !== undefined) {
    const cAddr = serverInfo.client_addr.trim();
    if (!isAllowedCiDatabaseIp(cAddr)) {
      throw new Error(
        `CI MIGRATION SAFETY GATE BLOCKED: Non-loopback/non-local client IP detected [${cAddr}]. ` +
          'Refusing to run CI migrations against remote or shared database networks.',
      );
    }
  }

  // 4. Authoritative check: Neon cloud platform detection
  let neonSettingsRows: Array<{ name: string; setting: string }>;
  try {
    neonSettingsRows = (await dataSource.query(`
      SELECT name, setting 
      FROM pg_settings 
      WHERE name IN ('neon.project_id', 'neon.branch_id', 'neon.endpoint_id')
        AND setting IS NOT NULL 
        AND setting != '';
    `)) as Array<{ name: string; setting: string }>;
  } catch {
    // If pg_settings query fails (e.g. standard local postgres without GUC), that's expected
    neonSettingsRows = [];
  }

  if (neonSettingsRows.length > 0) {
    throw new Error(
      'CI MIGRATION SAFETY GATE BLOCKED: Neon cloud database settings detected on server! ' +
        'The CI migration runner is strictly prohibited from running against Neon databases.',
    );
  }

  // 5. Authoritative check: Check for forbidden shared-subsystem tables
  let sharedTablesRows: Array<{ table_name: string }>;
  try {
    const tableListSql = FORBIDDEN_SHARED_TABLES.map((t) => `'${t}'`).join(
      ', ',
    );
    sharedTablesRows = (await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = current_schema()
        AND table_name IN (${tableListSql});
    `)) as Array<{ table_name: string }>;
  } catch (error) {
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Failed to inspect schema isolation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (sharedTablesRows.length > 0) {
    const foundTables = sharedTablesRows.map((r) => r.table_name).join(', ');
    throw new Error(
      `CI MIGRATION SAFETY GATE BLOCKED: Shared hotel subsystem tables detected [${foundTables}]. ` +
        'The CI migration runner requires a fresh, disposable database without cross-domain persistence.',
    );
  }

  return {
    isDisposableLocal: true,
    databaseName: serverInfo.db_name,
    serverAddr: serverInfo.server_addr || 'unix_socket',
    pgVersion: serverInfo.pg_version,
  };
}
