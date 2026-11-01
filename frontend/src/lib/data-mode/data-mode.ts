/**
 * Data Mode Configuration & Runtime Switcher
 *
 * Supports two explicit operational modes:
 * - 'demo': Deterministic, multi-room realistic fixture simulation without backend dependency.
 * - 'api':  Real HTTP API requests to the FOSS backend without synthetic fallback data.
 *
 * PRODUCTION SAFETY:
 * In production (NODE_ENV === 'production'), Demo Mode is STRICTLY PROHIBITED and
 * getDataMode() unconditionally returns 'api'.
 */

export type DataMode = 'demo' | 'api';

const DATA_MODE_STORAGE_KEY = 'foss_data_mode';
export const DATA_MODE_CHANGE_EVENT = 'foss:data-mode-changed';

let memoryDataModeOverride: DataMode | null = null;

/**
 * Checks whether the current environment is production.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns the active data mode.
 * In production, this always returns 'api' regardless of any configuration or storage.
 */
export function getDataMode(): DataMode {
  if (isProduction()) {
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
 * Sets the active data mode in development/testing environments.
 * Throws an error if attempted in production.
 */
export function setDataMode(mode: DataMode): void {
  if (isProduction()) {
    throw new Error('Production safety violation: Demo mode cannot be activated in production.');
  }

  memoryDataModeOverride = mode;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DATA_MODE_STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent(DATA_MODE_CHANGE_EVENT, { detail: { mode } }));
    } catch {
      // Ignore storage errors in non-browser contexts
    }
  }
}

/**
 * Resets any data mode overrides for clean test isolation.
 */
export function resetDataModeForTesting(): void {
  memoryDataModeOverride = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(DATA_MODE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
