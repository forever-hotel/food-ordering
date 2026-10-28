import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '../enums/booking-status.enum.js';
import {
  BookingProvider,
  BookingRecord,
} from '../interfaces/booking-provider.interface.js';

export const MOCK_BOOKING_FIXTURES: Record<string, BookingRecord> = {
  // 101: Active Checked-In Stay (Happy Path)
  'b1010000-0000-4000-8000-000000000101': {
    bookingId: 'b1010000-0000-4000-8000-000000000101',
    roomNumber: '101',
    status: BookingStatus.CHECKED_IN,
    stayStart: new Date(Date.now() - 24 * 60 * 60 * 1000), // Checked in yesterday
    stayEnd: new Date(Date.now() + 48 * 60 * 60 * 1000), // Checking out in 2 days
    guestName: 'Demo Guest 101',
  },
  // 102: Reserved Stay (Not yet checked in at Front Desk)
  'b1020000-0000-4000-8000-000000000102': {
    bookingId: 'b1020000-0000-4000-8000-000000000102',
    roomNumber: '102',
    status: BookingStatus.RESERVED,
    stayStart: new Date(Date.now() + 12 * 60 * 60 * 1000), // Arriving in 12 hours
    stayEnd: new Date(Date.now() + 72 * 60 * 60 * 1000),
    guestName: 'Demo Guest 102',
  },
  // 103: Checked-Out Stay (Completed)
  'b1030000-0000-4000-8000-000000000103': {
    bookingId: 'b1030000-0000-4000-8000-000000000103',
    roomNumber: '103',
    status: BookingStatus.CHECKED_OUT,
    stayStart: new Date(Date.now() - 72 * 60 * 60 * 1000),
    stayEnd: new Date(Date.now() - 12 * 60 * 60 * 1000), // Checked out 12 hours ago
    guestName: 'Demo Guest 103',
  },
  // 104: Cancelled Stay
  'b1040000-0000-4000-8000-000000000104': {
    bookingId: 'b1040000-0000-4000-8000-000000000104',
    roomNumber: '104',
    status: BookingStatus.CANCELLED,
    stayStart: new Date(Date.now() - 12 * 60 * 60 * 1000),
    stayEnd: new Date(Date.now() + 36 * 60 * 60 * 1000),
    guestName: 'Demo Guest 104',
  },
  // 105: Expired Stay Window (Checked-in record whose checkout timestamp has passed)
  'b1050000-0000-4000-8000-000000000105': {
    bookingId: 'b1050000-0000-4000-8000-000000000105',
    roomNumber: '105',
    status: BookingStatus.CHECKED_IN,
    stayStart: new Date(Date.now() - 48 * 60 * 60 * 1000),
    stayEnd: new Date(Date.now() - 2 * 60 * 60 * 1000), // Stay expired 2 hours ago
    guestName: 'Demo Guest 105',
  },
};

/**
 * Deterministic mock adapter for Booking/Room verification during development and demo.
 * Simulates authoritative FDS stay checks without accessing live hotel management systems.
 */
@Injectable()
export class MockBookingAdapter implements BookingProvider {
  private readonly fixtures: Map<string, BookingRecord>;
  private readonly initialFixtures: Record<string, BookingRecord>;

  constructor(
    private readonly clock: () => Date = () => new Date(),
    customFixtures?: Record<string, BookingRecord>,
  ) {
    this.initialFixtures = customFixtures ?? MOCK_BOOKING_FIXTURES;
    this.fixtures = new Map();
    this.reset();
  }

  reset(): void {
    this.fixtures.clear();
    for (const [key, value] of Object.entries(this.initialFixtures)) {
      this.fixtures.set(key, { ...value });
    }
  }

  async getBookingById(bookingId: string): Promise<BookingRecord | null> {
    const record = this.fixtures.get(bookingId);
    return record ? { ...record } : null;
  }

  async verifyBooking(
    bookingId: string,
    roomNumber: string,
  ): Promise<BookingRecord> {
    const record = this.fixtures.get(bookingId);

    if (!record) {
      throw new NotFoundException(`Booking not found: ${bookingId}`);
    }

    // Room mismatch verification
    if (record.roomNumber !== roomNumber) {
      throw new ForbiddenException(
        `Room number mismatch: booking is assigned to room ${record.roomNumber}, not ${roomNumber}`,
      );
    }

    // Stay lifecycle status verification
    if (record.status !== BookingStatus.CHECKED_IN) {
      if (record.status === BookingStatus.RESERVED) {
        throw new ForbiddenException(
          'Booking is RESERVED. Guest has not completed check-in at the Front Desk.',
        );
      }
      if (record.status === BookingStatus.CHECKED_OUT) {
        throw new ForbiddenException(
          'Booking is CHECKED_OUT. Guest stay has concluded.',
        );
      }
      if (record.status === BookingStatus.CANCELLED) {
        throw new ForbiddenException('Booking is CANCELLED.');
      }
      throw new ForbiddenException(
        `Booking status ${record.status} is not authorized for in-room services.`,
      );
    }

    // Stay window verification with 15-minute clock skew tolerance
    const now = this.clock().getTime();
    const clockSkewGraceMs = 15 * 60 * 1000;

    if (now < record.stayStart.getTime() - clockSkewGraceMs) {
      throw new ForbiddenException(
        'Stay window has not commenced. Access is not yet authorized.',
      );
    }

    if (now > record.stayEnd.getTime() + clockSkewGraceMs) {
      throw new ForbiddenException(
        'Stay window has expired. In-room ordering is no longer available.',
      );
    }

    return { ...record };
  }

  async checkoutBooking(bookingId: string): Promise<BookingRecord | null> {
    const record = this.fixtures.get(bookingId);
    if (!record) {
      return null;
    }
    record.status = BookingStatus.CHECKED_OUT;
    record.stayEnd = this.clock();
    return { ...record };
  }

  async reassignRoom(
    bookingId: string,
    newRoomNumber: string,
  ): Promise<BookingRecord | null> {
    const record = this.fixtures.get(bookingId);
    if (!record) {
      return null;
    }
    record.roomNumber = newRoomNumber;
    return { ...record };
  }
}
