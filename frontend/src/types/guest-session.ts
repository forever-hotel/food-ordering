export interface GuestStayInfo {
  guestId: string;
  bookingId: string;
  roomNumber: string;
  guestName: string;
  role: 'GUEST';
}

export interface GuestSessionResponse {
  sessionToken: string;
  expiresAt: string;
  guest: GuestStayInfo;
}

export interface GuestContext extends GuestStayInfo {
  sessionId?: string;
  active?: boolean;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'expired' | 'error';
