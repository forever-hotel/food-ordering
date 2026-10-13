export type BookingStatus =
  'CHECKED_IN' | 'RESERVED' | 'CANCELLED' | 'CHECKED_OUT';

export interface BookingRecord {
  bookingId: string;
  roomNumber: string;
  status: BookingStatus;
  checkInDate: Date;
  checkOutDate: Date;
}

export interface BookingProvider {
  findById(bookingId: string): Promise<BookingRecord | null>;
}

export interface VerifiedBooking {
  bookingId: string;
  roomNumber: string;
}

export const BOOKING_PROVIDER = Symbol('BOOKING_PROVIDER');
