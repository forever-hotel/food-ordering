import type { GuestContext, GuestSessionResponse } from '../../types/guest-session.ts';
import { getSessionsProvider } from '../data-mode/provider-factory.ts';
import { ApiError } from '../data-mode/api-error.ts';

export { ApiError };

/**
 * Redeems a signed QR token with the FOSS backend or Demo State Store to establish a guest session.
 */
export async function redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
  return getSessionsProvider().redeemQrToken(qrToken);
}

/**
 * Validates active session and retrieves guest stay context.
 */
export async function fetchCurrentSession(sessionToken: string): Promise<GuestContext> {
  return getSessionsProvider().fetchCurrentSession(sessionToken);
}

/**
 * Authoritatively renews active session context against Front Desk for multi-day stays.
 */
export async function renewSession(sessionToken: string): Promise<GuestSessionResponse> {
  const provider = getSessionsProvider();
  if (provider.renewSession) {
    return provider.renewSession(sessionToken);
  }
  const current = await provider.fetchCurrentSession(sessionToken);
  return {
    sessionToken,
    guest: current,
    expiresAt: current.stayEnd || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
}

/**
 * Logs out the active guest session.
 */
export async function logoutSession(
  sessionToken: string,
): Promise<{ success: boolean; message: string }> {
  return getSessionsProvider().logoutSession(sessionToken);
}

/**
 * Fetches demo room tokens from the provider.
 */
export async function fetchDemoTokens(): Promise<Record<string, string>> {
  return getSessionsProvider().fetchDemoTokens();
}

/**
 * Triggers development-only demo state reset on the backend.
 */
export async function resetBackendDemo(): Promise<{ success: boolean; message: string }> {
  const provider = getSessionsProvider();
  if (provider.resetDemo) {
    return provider.resetDemo();
  }
  return { success: true, message: 'Reset completed' };
}
