export class FdsCheckoutEventDto {
  eventId!: string;
  eventType!: 'fds.guest.checkout';
  bookingId!: string;
  roomNumber!: string;
  checkoutTime!: string;
}

export class FdsRoomReassignEventDto {
  eventId!: string;
  eventType!: 'fds.room.reassigned';
  bookingId!: string;
  previousRoomNumber!: string;
  newRoomNumber!: string;
  reassignedAt!: string;
  reason?: string;
}

export class FdsEventResponseDto {
  success!: boolean;
  processed!: boolean;
  duplicate?: boolean;
  message!: string;
  bookingId?: string;
  sessionRevoked?: boolean;
  sessionId?: string;
}
