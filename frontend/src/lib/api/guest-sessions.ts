import API_URL from './config.ts';
import type { GuestContext, GuestSessionResponse } from '../../types/guest-session.ts';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly data?: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

/**
 * Redeems a signed QR token with the FOSS backend to establish a guest session.
 */
export async function redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
  const response = await fetch(`${API_URL}/guest-sessions/qr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrToken }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      body?.message || body?.error || 'Failed to authenticate QR code. Please try again.';
    throw new ApiError(errorMsg, response.status, body);
  }

  return body as GuestSessionResponse;
}

/**
 * Validates active session and retrieves guest stay context from /guest-sessions/me.
 */
export async function fetchCurrentSession(sessionToken: string): Promise<GuestContext> {
  const response = await fetch(`${API_URL}/guest-sessions/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.message || 'Session expired or invalid.';
    throw new ApiError(errorMsg, response.status, body);
  }

  return body as GuestContext;
}

/**
 * Logs out the active guest session.
 */
export async function logoutSession(
  sessionToken: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/guest-sessions/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.message || 'Failed to logout.';
    throw new ApiError(errorMsg, response.status, body);
  }

  return body;
}

/**
 * Fetches demo room tokens from the backend helper endpoint.
 */
export async function fetchDemoTokens(): Promise<Record<string, string>> {
  try {
    const response = await fetch(`${API_URL}/guest-sessions/demo-tokens`, {
      method: 'GET',
    });
    if (!response.ok) {
      return {};
    }
    const body = await response.json();
    return body?.tokens || {};
  } catch {
    return {};
  }
}
