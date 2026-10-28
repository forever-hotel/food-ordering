import { BookingStatus } from '../enums/booking-status.enum.js';

export const BOOKING_PROVIDER = 'BOOKING_PROVIDER';

/**
 * Authoritative stay data returned from Front Desk Subsystem (FDS/HW).
 * Note: FOSS does NOT persist or own Booking/Room tables.
 */
export interface BookingRecord {
  bookingId: string;
  roomNumber: string;
  status: BookingStatus;
  stayStart: Date;
  stayEnd: Date;
  guestName?: string;
}

/**
 * Typed provider contract for booking and room stay verification.
 * Implemented as an abstract class to support ESM decorator metadata and DI tokening.
 */
export abstract class BookingProvider {
  /**
   * Retrieves a booking by its unique identifier from the authoritative service.
   */
  abstract getBookingById(bookingId: string): Promise<BookingRecord | null>;

  /**
   * Verifies that the booking exists, matches the room, has CHECKED_IN status,
   * and falls within the active stay time window.
   */
  abstract verifyBooking(
    bookingId: string,
    roomNumber: string,
  ): Promise<BookingRecord>;
}
