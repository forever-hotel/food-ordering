import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { SessionsProvider } from '../interfaces.ts';
import type { GuestContext, GuestSessionResponse } from '../../../types/guest-session.ts';

export class ApiSessionsProvider implements SessionsProvider {
  async redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
    if (!qrToken || qrToken.trim() === '') {
      throw new ApiError('QR activation code is required.', 400);
    }
    if (
      qrToken.startsWith('act-demo-') ||
      qrToken.startsWith('qr-token-demo-') ||
      ['101', '102', '103', '204', '999'].includes(qrToken)
    ) {
      throw new ApiError('Demonstration QR tokens cannot be redeemed against the real API.', 400);
    }

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

  async fetchCurrentSession(sessionToken: string): Promise<GuestContext> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to fetch session context.', 401);
    }
    if (sessionToken.startsWith('demo-token-')) {
      throw new ApiError(
        'Demonstration session tokens cannot be transmitted to real API endpoints.',
        401,
      );
    }

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

  async logoutSession(sessionToken: string): Promise<{ success: boolean; message: string }> {
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

  async fetchDemoTokens(): Promise<Record<string, string>> {
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
}
