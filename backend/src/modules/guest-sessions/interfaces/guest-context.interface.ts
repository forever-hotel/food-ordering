export interface GuestContext {
  sessionId: string;
  bookingId: string;
  guestId: string;
  roomNumber: string;
  guestName?: string;
  stayStart?: string;
  stayEnd?: string;
  role: 'GUEST';
}
