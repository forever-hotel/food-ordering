import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BookingVerificationResultDto } from './dto/booking-verification-result.dto.js';
import {
  BOOKING_PROVIDER,
  BookingProvider,
} from './interfaces/booking-provider.interface.js';

/**
 * Service orchestrating booking and room verification for FOSS guest flows.
 * Enforces room scope, verified check-in status, and active stay duration.
 */
@Injectable()
export class BookingVerificationService {
  private readonly logger = new Logger(BookingVerificationService.name);

  constructor(
    @Inject(BOOKING_PROVIDER)
    private readonly bookingProvider: BookingProvider,
  ) {}

  /**
   * Verifies that the guest has an active, checked-in stay matching the specified room.
   */
  async verifyStay(
    bookingId: string,
    roomNumber: string,
  ): Promise<BookingVerificationResultDto> {
    if (
      !bookingId ||
      typeof bookingId !== 'string' ||
      bookingId.trim() === ''
    ) {
      throw new BadRequestException('bookingId must be a non-empty string.');
    }

    if (
      !roomNumber ||
      typeof roomNumber !== 'string' ||
      roomNumber.trim() === ''
    ) {
      throw new BadRequestException('roomNumber must be a non-empty string.');
    }

    const cleanBookingId = bookingId.trim();
    const cleanRoomNumber = roomNumber.trim();

    this.logger.log(
      `Verifying stay for room [${cleanRoomNumber}] and booking [${cleanBookingId}]`,
    );

    const record = await this.bookingProvider.verifyBooking(
      cleanBookingId,
      cleanRoomNumber,
    );

    return {
      valid: true,
      bookingId: record.bookingId,
      roomNumber: record.roomNumber,
      status: record.status,
      stayStart: record.stayStart.toISOString(),
      stayEnd: record.stayEnd.toISOString(),
      guestName: record.guestName,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Simulates FDS checkout on the underlying provider (if supported, e.g. MockBookingAdapter).
   */
  async simulateCheckout(bookingId: string): Promise<boolean> {
    if (typeof this.bookingProvider.checkoutBooking === 'function') {
      const updated = await this.bookingProvider.checkoutBooking(
        bookingId.trim(),
      );
      return updated !== null;
    }
    return false;
  }

  /**
   * Simulates FDS room reassignment on the underlying provider (if supported, e.g. MockBookingAdapter).
   */
  async simulateRoomReassign(
    bookingId: string,
    newRoomNumber: string,
  ): Promise<boolean> {
    if (typeof this.bookingProvider.reassignRoom === 'function') {
      const updated = await this.bookingProvider.reassignRoom(
        bookingId.trim(),
        newRoomNumber.trim(),
      );
      return updated !== null;
    }
    return false;
  }
}
