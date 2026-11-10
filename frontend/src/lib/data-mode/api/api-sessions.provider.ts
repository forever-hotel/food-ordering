import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { SessionsProvider } from '../interfaces.ts';
import type { GuestContext, GuestSessionResponse } from '../../../types/guest-session.ts';

export class ApiSessionsProvider implements SessionsProvider {
  async redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
    if (!qrToken || qrToken.trim() === '') {
      throw new ApiError('QR activation code is required.', 400);
    }
    if (qrToken.startsWith('act-demo-') || qrToken.startsWith('qr-token-demo-')) {
      throw new ApiError('Demonstration QR tokens cannot be redeemed against the real API.', 400);
    }

    const response = await fetch(`${API_URL}/guest-sessions/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ qrToken: qrToken.trim() }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        body?.message || body?.error || 'Failed to authenticate QR code. Please try again.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return {
      sessionToken: body.sessionToken,
      expiresAt: body.expiresAt,
      guest: {
        guestId:
          body.sessionId ||
          body.guestId ||
          body.guest?.guestId ||
          `guest-${body.roomNumber || body.guest?.roomNumber}`,
        bookingId: body.bookingId || body.guest?.bookingId,
        roomNumber: body.roomNumber || body.guest?.roomNumber,
        guestName: body.guestName || body.guest?.guestName,
        role: 'GUEST',
      },
    };
  }

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    // Demo reset HTTP endpoint has been retired (#101).
    // State reset is only available in isolated mock mode via DemoSessionsProvider.
    return {
      success: true,
      message:
        'Demo reset HTTP endpoint retired. Live API mode uses legitimate backend session lifecycle.',
    };
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
      credentials: 'include',
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Session expired or invalid.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as GuestContext;
  }

  async renewSession(sessionToken: string): Promise<GuestSessionResponse> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to renew session.', 401);
    }
    if (sessionToken.startsWith('demo-token-')) {
      throw new ApiError(
        'Demonstration session tokens cannot be transmitted to real API endpoints.',
        401,
      );
    }

    const response = await fetch(`${API_URL}/guest-sessions/renew`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      credentials: 'include',
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Session renewal failed or stay concluded.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return {
      sessionToken: body.sessionToken,
      expiresAt: body.expiresAt,
      guest: {
        guestId:
          body.sessionId ||
          body.guestId ||
          body.guest?.guestId ||
          `guest-${body.roomNumber || body.guest?.roomNumber}`,
        bookingId: body.bookingId || body.guest?.bookingId,
        roomNumber: body.roomNumber || body.guest?.roomNumber,
        guestName: body.guestName || body.guest?.guestName,
        role: 'GUEST',
        stayStart: body.stayStart,
        stayEnd: body.stayEnd,
      },
    };
  }

  async logoutSession(sessionToken: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/guest-sessions/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      credentials: 'include',
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Failed to logout.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body;
  }

  async fetchDemoTokens(): Promise<Record<string, string>> {
    // Production & live API mode does not expose demo-token retrieval endpoints (#101).
    // Real QR activation via redeemQrToken is required to establish authenticated backend sessions.
    return {};
  }
}
