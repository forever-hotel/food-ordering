export class GuestSessionResponseDto {
  sessionId!: string;
  bookingId!: string;
  roomNumber!: string;
  sessionToken!: string;
  guestName?: string;
  stayStart!: string;
  stayEnd!: string;
  expiresAt!: string;
  createdAt!: string;
  active!: boolean;
}
