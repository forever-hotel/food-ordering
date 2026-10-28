import { BookingStatus } from '../enums/booking-status.enum.js';

/**
 * Sanitized verification response containing approved guest context.
 * PII is kept minimal per SDS Chapter 6 data protection requirements.
 */
export class BookingVerificationResultDto {
  valid!: boolean;
  bookingId!: string;
  roomNumber!: string;
  status!: BookingStatus;
  stayStart!: string;
  stayEnd!: string;
  guestName?: string;
  verifiedAt!: string;
}
