import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const PRODUCTION_OR_STAGING_ENVS = new Set([
  'production',
  'prod',
  'staging',
  'stage',
]);

const AUTHORIZED_NON_PROD_ENVS = new Set(['development', 'test']);

/**
 * Evaluates whether order status demo simulation is authorized to run.
 *
 * Isolation guarantees:
 * - Disabled by default (`ENABLE_ORDER_DEMO_SIMULATION` must be explicitly `'true'`).
 * - Strictly blocked in production and staging regardless of feature flags.
 * - Requires an explicit `'development'` or `'test'` environment, `DEMO_MODE=true`,
 *   and `SHARED_DATABASE_MODE !== 'true'` so real/shared order records cannot be mutated.
 */
export function isOrderDemoSimulationEnabled(
  configService?: ConfigService,
): boolean {
  const procNodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();
  const cfgNodeEnv = (configService?.get<string>('NODE_ENV') ?? '')
    .trim()
    .toLowerCase();
  const procDeployEnv = (process.env.DEPLOYMENT_ENV ?? '').trim().toLowerCase();
  const cfgDeployEnv = (configService?.get<string>('DEPLOYMENT_ENV') ?? '')
    .trim()
    .toLowerCase();

  if (
    PRODUCTION_OR_STAGING_ENVS.has(procNodeEnv) ||
    PRODUCTION_OR_STAGING_ENVS.has(cfgNodeEnv) ||
    PRODUCTION_OR_STAGING_ENVS.has(procDeployEnv) ||
    PRODUCTION_OR_STAGING_ENVS.has(cfgDeployEnv)
  ) {
    return false;
  }

  const effectiveNodeEnv = cfgNodeEnv || procNodeEnv;
  if (!AUTHORIZED_NON_PROD_ENVS.has(effectiveNodeEnv)) {
    return false;
  }

  const featureEnabled =
    (configService?.get<string>('ENABLE_ORDER_DEMO_SIMULATION') ??
      process.env.ENABLE_ORDER_DEMO_SIMULATION) === 'true';
  const demoModeEnabled =
    (configService?.get<string>('DEMO_MODE') ?? process.env.DEMO_MODE) ===
    'true';
  const sharedDatabaseMode =
    (configService?.get<string>('SHARED_DATABASE_MODE') ??
      process.env.SHARED_DATABASE_MODE) === 'true';

  return featureEnabled && demoModeEnabled && !sharedDatabaseMode;
}

/**
 * Enforces server-side demo simulation isolation, failing closed with 403 Forbidden.
 */
export function assertOrderDemoSimulationEnabled(
  configService?: ConfigService,
): void {
  if (!isOrderDemoSimulationEnabled(configService)) {
    throw new ForbiddenException(
      'Demo order status simulation is disabled. It is only permitted in authorized non-production environments with ENABLE_ORDER_DEMO_SIMULATION=true and DEMO_MODE=true.',
    );
  }
}
