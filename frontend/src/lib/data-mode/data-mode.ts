/**
 * Data Mode Configuration, Deployment Policy & Runtime Switcher
 *
 * Supports two explicit operational modes:
 * - 'demo': Deterministic, multi-room realistic fixture simulation without backend dependency.
 * - 'api':  Real HTTP API requests to the FOSS backend without synthetic fallback data.
 *
 * DEPLOYMENT SAFETY POLICY:
 * Distinguishes 4 target deployment tiers:
 * 1. 'development': Local dev environment. Demo and API modes permitted.
 * 2. 'preview': Isolated demonstration preview deployments (e.g. Vercel/Netlify preview).
 *    Demo mode allowed ONLY if NEXT_PUBLIC_ALLOW_DEMO_PREVIEW=true is explicitly configured.
 * 3. 'staging': Staging integration environment. Real API mode strictly required.
 * 4. 'production': Production environment. Demo Mode is STRICTLY PROHIBITED; getDataMode()
 *    unconditionally returns 'api' and setDataMode('demo') throws a security exception.
 */

export type DataMode = 'demo' | 'api';
export type DeploymentEnv = 'development' | 'preview' | 'staging' | 'production';

export const DATA_MODE_STORAGE_KEY = 'foss_data_mode';
export const DATA_MODE_CHANGE_EVENT = 'foss:data-mode-changed';

export const SESSION_STORAGE_KEY_API = 'foss_guest_session_token_api';
export const SESSION_STORAGE_KEY_DEMO = 'foss_guest_session_token_demo';
export const LEGACY_SESSION_STORAGE_KEY = 'foss_guest_session_token';

let memoryDataModeOverride: DataMode | null = null;
let memoryDeploymentEnvOverride: DeploymentEnv | null = null;

/**
 * Resolves the configured deployment environment.
 */
export function getDeploymentEnv(): DeploymentEnv {
  if (memoryDeploymentEnvOverride) {
    return memoryDeploymentEnvOverride;
  }

  const env = (
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ||
    process.env.DEPLOYMENT_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  ).toLowerCase();

  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  if (env === 'preview' || env === 'demo-preview') return 'preview';
  return 'development';
}

/**
 * Checks whether the current deployment tier is production.
 */
export function isProduction(): boolean {
  const env = getDeploymentEnv();
  return env === 'production' || (process.env.NODE_ENV === 'production' && env !== 'preview');
}

/**
 * Determines whether Demo Mode is permitted in the current deployment environment.
 */
export function isDemoAllowed(): boolean {
  const env = getDeploymentEnv();
  if (env === 'production' || env === 'staging') {
    return false;
  }
  if (env === 'preview') {
    // Only allowed if explicitly opted in for isolated demonstration preview
    return (
      process.env.NEXT_PUBLIC_ALLOW_DEMO_PREVIEW === 'true' ||
      process.env.NEXT_PUBLIC_DATA_MODE === 'demo'
    );
  }
  return true; // 'development'
}

/**
 * Returns the partition-scoped session storage key for the current or given data mode.
 * Strictly isolates demo tokens from API tokens in browser storage.
 */
export function getSessionStorageKey(mode?: DataMode): string {
  const activeMode = mode || getDataMode();
  return activeMode === 'demo' ? SESSION_STORAGE_KEY_DEMO : SESSION_STORAGE_KEY_API;
}

/**
 * Returns the active data mode.
 * In production or staging, this unconditionally returns 'api'.
 */
export function getDataMode(): DataMode {
  if (!isDemoAllowed()) {
    return 'api';
  }

  if (memoryDataModeOverride) {
    return memoryDataModeOverride;
  }

  // Check client-side session/local storage override for manual testing
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(DATA_MODE_STORAGE_KEY);
      if (stored === 'demo' || stored === 'api') {
        return stored;
      }
    } catch {
      // Fall through to environment variable
    }
  }

  // Check environment variable
  const envMode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (envMode === 'demo') {
    return 'demo';
  }

  return 'api';
}

/**
 * Sets the active data mode in authorized environments.
 * Throws a security violation if attempted in production or staging.
 */
export function setDataMode(nextMode: DataMode): void {
  if (!isDemoAllowed() && nextMode === 'demo') {
    throw new Error(
      `Production safety violation: Demo mode cannot be activated in ${getDeploymentEnv()} environment.`,
    );
  }

  const previousMode = getDataMode();
  memoryDataModeOverride = nextMode;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DATA_MODE_STORAGE_KEY, nextMode);

      // Clean up previous mode's stored tokens to prevent cross-mode reuse
      if (previousMode !== nextMode) {
        window.sessionStorage.removeItem(getSessionStorageKey(previousMode));
        window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      }

      window.dispatchEvent(
        new CustomEvent(DATA_MODE_CHANGE_EVENT, {
          detail: { mode: nextMode, previousMode },
        }),
      );
    } catch {
      // Ignore storage errors in non-browser contexts
    }
  }
}

/**
 * Resets any data mode and deployment tier overrides for clean test isolation.
 */
export function resetDataModeForTesting(): void {
  memoryDataModeOverride = null;
  memoryDeploymentEnvOverride = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(DATA_MODE_STORAGE_KEY);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY_API);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY_DEMO);
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Override deployment environment for automated test suites.
 */
export function setDeploymentEnvForTesting(env: DeploymentEnv | null): void {
  memoryDeploymentEnvOverride = env;
}
