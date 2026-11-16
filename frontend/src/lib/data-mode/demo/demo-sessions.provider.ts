import type { SessionsProvider } from '../interfaces.ts';
import type { GuestContext, GuestSessionResponse } from '../../../types/guest-session.ts';
import { DemoStateStore } from './demo-state-store.ts';
import { ApiError } from '../api-error.ts';

export class DemoSessionsProvider implements SessionsProvider {
  private readonly store = DemoStateStore.getInstance();

  async redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
    if (!qrToken || qrToken.trim() === '') {
      throw new ApiError('QR activation code is required.', 400);
    }
    const stay = this.store.resolveStayByQr(qrToken);
    return {
      sessionToken: stay.sessionToken,
      expiresAt: stay.checkOut,
      guest: {
        guestId: `guest-${stay.roomNumber}`,
        bookingId: stay.bookingId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName,
        role: 'GUEST',
      },
    };
  }

  async fetchCurrentSession(sessionToken?: string): Promise<GuestContext> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to fetch session context.', 401);
    }
    if (!sessionToken.startsWith('demo-token-')) {
      throw new ApiError('Real API tokens cannot be resolved in Demo Mode.', 401);
    }
    const stay = this.store.resolveStayByToken(sessionToken);
    return {
      guestId: `guest-${stay.roomNumber}`,
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      guestName: stay.guestName,
      role: 'GUEST',
      active: true,
      stayStart: stay.checkIn,
      stayEnd: stay.checkOut,
    };
  }

  async renewSession(sessionToken?: string): Promise<GuestSessionResponse> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to renew session.', 401);
    }
    if (!sessionToken.startsWith('demo-token-')) {
      throw new ApiError('Real API tokens cannot be resolved in Demo Mode.', 401);
    }
    const stay = this.store.resolveStayByToken(sessionToken);
    return {
      sessionToken: stay.sessionToken,
      expiresAt: stay.checkOut,
      guest: {
        guestId: `guest-${stay.roomNumber}`,
        bookingId: stay.bookingId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName,
        role: 'GUEST',
        stayStart: stay.checkIn,
        stayEnd: stay.checkOut,
      },
    };
  }

  async logoutSession(_sessionToken?: string): Promise<{ success: boolean; message: string }> {
    void _sessionToken;
    return {
      success: true,
      message: 'Demo session logged out successfully.',
    };
  }

  async fetchDemoTokens(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const stay of this.store.getStays()) {
      if (!stay.isExpired) {
        map[`Room ${stay.roomNumber} (${stay.guestName})`] = stay.qrToken;
      }
    }
    return map;
  }

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    this.store.reset();
    return {
      success: true,
      message: 'Demo state reset to initial fixtures.',
    };
  }
}
