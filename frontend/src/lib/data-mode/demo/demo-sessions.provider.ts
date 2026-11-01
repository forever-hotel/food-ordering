import type { SessionsProvider } from '../interfaces.ts';
import type { GuestContext, GuestSessionResponse } from '../../../types/guest-session.ts';
import { DemoStateStore, DEMO_STAYS } from './demo-state-store.ts';

export class DemoSessionsProvider implements SessionsProvider {
  private readonly store = DemoStateStore.getInstance();

  async redeemQrToken(qrToken: string): Promise<GuestSessionResponse> {
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

  async fetchCurrentSession(sessionToken: string): Promise<GuestContext> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return {
      guestId: `guest-${stay.roomNumber}`,
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      guestName: stay.guestName,
      role: 'GUEST',
      active: true,
    };
  }

  async logoutSession(_sessionToken: string): Promise<{ success: boolean; message: string }> {
    void _sessionToken;
    return {
      success: true,
      message: 'Demo session logged out successfully.',
    };
  }

  async fetchDemoTokens(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const stay of DEMO_STAYS) {
      if (!stay.isExpired) {
        map[`Room ${stay.roomNumber} (${stay.guestName})`] = stay.qrToken;
      }
    }
    return map;
  }
}
