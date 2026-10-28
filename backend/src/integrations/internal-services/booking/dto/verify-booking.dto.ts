/**
 * Data transfer object for requesting booking and room stay verification.
 */
export class VerifyBookingDto {
  bookingId!: string;
  roomNumber!: string;
}
