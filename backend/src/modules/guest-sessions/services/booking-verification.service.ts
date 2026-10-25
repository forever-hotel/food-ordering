import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  BOOKING_PROVIDER,
  type BookingProvider,
  type VerifiedBooking,
} from '../interfaces/booking-verification.interface.js';

@Injectable()
export class BookingVerificationService {
  constructor(
    @Inject(BOOKING_PROVIDER)
    private readonly bookingProvider: BookingProvider,
  ) {}

  async verifyBooking(
    bookingId: string,
    roomNumber: string,
  ): Promise<VerifiedBooking> {
    if (!bookingId?.trim() || !roomNumber?.trim()) {
      throw new ForbiddenException('Booking verification failed');
    }

    let booking;

    try {
      booking = await this.bookingProvider.findById(bookingId);
    } catch {
      throw new ServiceUnavailableException(
        'Booking verification is temporarily unavailable',
      );
    }

    if (!booking) {
      throw new ForbiddenException('Booking verification failed');
    }

    if (booking.bookingId !== bookingId) {
      throw new ForbiddenException('Booking verification failed');
    }

    if (booking.status !== 'CHECKED_IN') {
      throw new ForbiddenException('Booking verification failed');
    }

    if (booking.roomNumber !== roomNumber) {
      throw new ForbiddenException('Booking verification failed');
    }

    const now = new Date();

    if (
      !Number.isFinite(booking.checkInDate.getTime()) ||
      !Number.isFinite(booking.checkOutDate.getTime()) ||
      now < booking.checkInDate ||
      now >= booking.checkOutDate
    ) {
      throw new ForbiddenException('Booking verification failed');
    }

    return {
      bookingId: booking.bookingId,
      roomNumber: booking.roomNumber,
    };
  }
}
