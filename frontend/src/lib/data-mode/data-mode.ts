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

export const LOCAL_STORAGE_SESSION_KEY_API = 'foss_persistent_session_api';
export const LOCAL_STORAGE_SESSION_KEY_DEMO = 'foss_persistent_session_demo';

export interface PersistentSessionRecord {
  token: string;
  mode: DataMode;
  expiresAt?: string;
  stayEnd?: string;
  storedAt: string;
}

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
 * Returns the partition-scoped localStorage key for persistent browser authentication.
 */
export function getPersistentStorageKey(mode?: DataMode): string {
  const activeMode = mode || getDataMode();
  return activeMode === 'demo' ? LOCAL_STORAGE_SESSION_KEY_DEMO : LOCAL_STORAGE_SESSION_KEY_API;
}

/**
 * Persists authenticated guest session securely across mobile browser tab closures and restarts.
 * Bounds persistent credentials with verified stay end and expiration timestamps.
 */
export function savePersistentSession(
  token: string,
  mode: DataMode,
  expiresAt?: string,
  stayEnd?: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    const record: PersistentSessionRecord = {
      token,
      mode,
      expiresAt,
      stayEnd,
      storedAt: new Date().toISOString(),
    };
    const persistentKey = getPersistentStorageKey(mode);
    window.localStorage.setItem(persistentKey, JSON.stringify(record));
    window.sessionStorage.setItem(getSessionStorageKey(mode), token);
  } catch {
    // Graceful fallback if storage quota exceeded or storage disabled
  }
}

/**
 * Loads and validates persistent guest session on browser reopening.
 * Fails closed if expired, corrupted, or scoped to a different data mode.
 */
export function loadPersistentSession(mode?: DataMode): string | null {
  if (typeof window === 'undefined') return null;
  const activeMode = mode || getDataMode();
  try {
    // 1. Check current tab's sessionStorage first
    const sessionToken = window.sessionStorage.getItem(getSessionStorageKey(activeMode));
    if (sessionToken) return sessionToken;

    // 2. Next check localStorage for tab reopen / mobile browser restart
    const persistentKey = getPersistentStorageKey(activeMode);
    const raw = window.localStorage.getItem(persistentKey);
    if (!raw) {
      // Check legacy unpartitioned sessionStorage key
      const legacy = window.sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (legacy) {
        const isDemoToken = legacy.startsWith('demo-token-');
        if ((activeMode === 'demo' && isDemoToken) || (activeMode === 'api' && !isDemoToken)) {
          window.sessionStorage.setItem(getSessionStorageKey(activeMode), legacy);
          window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
          return legacy;
        }
      }
      return null;
    }

    let record: PersistentSessionRecord;
    try {
      record = JSON.parse(raw);
    } catch {
      // Backward compatibility for raw token string
      window.sessionStorage.setItem(getSessionStorageKey(activeMode), raw);
      return raw;
    }

    if (!record || typeof record !== 'object' || !record.token) {
      clearPersistentSession(activeMode);
      return null;
    }

    if (record.mode && record.mode !== activeMode) {
      return null;
    }

    // Verify stay end / expiry timestamp
    const now = Date.now();
    const expiryTime = record.stayEnd
      ? new Date(record.stayEnd).getTime()
      : record.expiresAt
        ? new Date(record.expiresAt).getTime()
        : null;

    if (expiryTime && now >= expiryTime) {
      clearPersistentSession(activeMode);
      return null;
    }

    // Synchronize to current tab's sessionStorage
    window.sessionStorage.setItem(getSessionStorageKey(activeMode), record.token);
    return record.token;
  } catch {
    return null;
  }
}

/**
 * Clears persistent and tab-level guest session credentials upon logout, checkout, or revocation.
 */
export function clearPersistentSession(mode?: DataMode): void {
  if (typeof window === 'undefined') return;
  const activeMode = mode || getDataMode();
  try {
    window.localStorage.removeItem(getPersistentStorageKey(activeMode));
    window.sessionStorage.removeItem(getSessionStorageKey(activeMode));
    window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors in restricted contexts
  }
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
        clearPersistentSession(previousMode);
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
      clearPersistentSession('api');
      clearPersistentSession('demo');
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
