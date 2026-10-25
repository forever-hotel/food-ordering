import { Injectable } from '@nestjs/common';

import {
  BookingProvider,
  BookingRecord,
} from '../interfaces/booking-verification.interface.js';

/**
 * Development-only mock Booking provider.
 *
 * Replace with the approved Booking service integration
 * when the authoritative subsystem becomes available.
 *
 * Never use this provider to authorize production guests.
 */
@Injectable()
export class MockBookingProvider implements BookingProvider {
  private readonly bookings = new Map<string, BookingRecord>([
    [
      '11111111-1111-4111-8111-111111111111',
      {
        bookingId: '11111111-1111-4111-8111-111111111111',
        roomNumber: '101',
        status: 'CHECKED_IN',
        checkInDate: new Date('2026-01-01T00:00:00.000Z'),
        checkOutDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      {
        bookingId: '22222222-2222-4222-8222-222222222222',
        roomNumber: '102',
        status: 'RESERVED',
        checkInDate: new Date('2026-01-01T00:00:00.000Z'),
        checkOutDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      {
        bookingId: '33333333-3333-4333-8333-333333333333',
        roomNumber: '103',
        status: 'CANCELLED',
        checkInDate: new Date('2026-01-01T00:00:00.000Z'),
        checkOutDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
    [
      '44444444-4444-4444-8444-444444444444',
      {
        bookingId: '44444444-4444-4444-8444-444444444444',
        roomNumber: '104',
        status: 'CHECKED_OUT',
        checkInDate: new Date('2026-01-01T00:00:00.000Z'),
        checkOutDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
  ]);

  async findById(bookingId: string): Promise<BookingRecord | null> {
    const booking = this.bookings.get(bookingId);

    if (!booking) {
      return null;
    }

    // Return a copy to keep test callers from mutating mock records.
    return {
      ...booking,
      checkInDate: new Date(booking.checkInDate),
      checkOutDate: new Date(booking.checkOutDate),
    };
  }
}
