import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { BookingVerificationService } from './booking-verification.service.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingProvider } from './interfaces/booking-provider.interface.js';

describe('BookingVerificationService', () => {
  let service: BookingVerificationService;
  let mockProvider: {
    getBookingById: jest.MockedFunction<BookingProvider['getBookingById']>;
    verifyBooking: jest.MockedFunction<BookingProvider['verifyBooking']>;
  };

  beforeEach(() => {
    mockProvider = {
      getBookingById: jest.fn(),
      verifyBooking: jest.fn(),
    };
    service = new BookingVerificationService(
      mockProvider as unknown as BookingProvider,
    );
  });

  describe('verifyStay', () => {
    it('throws BadRequestException when bookingId is missing or whitespace', async () => {
      await expect(service.verifyStay('', '101')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyStay('   ', '101')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when roomNumber is missing or whitespace', async () => {
      await expect(service.verifyStay('b-101', '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyStay('b-101', '   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns sanitized BookingVerificationResultDto for verified stay', async () => {
      const stayStart = new Date('2026-10-27T10:00:00.000Z');
      const stayEnd = new Date('2026-10-30T10:00:00.000Z');

      mockProvider.verifyBooking.mockResolvedValue({
        bookingId: 'b-101',
        roomNumber: '101',
        status: BookingStatus.CHECKED_IN,
        stayStart,
        stayEnd,
        guestName: 'John Doe',
      });

      const result = await service.verifyStay('  b-101  ', ' 101 ');

      expect(mockProvider.verifyBooking).toHaveBeenCalledWith('b-101', '101');
      expect(result.valid).toBe(true);
      expect(result.bookingId).toBe('b-101');
      expect(result.roomNumber).toBe('101');
      expect(result.status).toBe(BookingStatus.CHECKED_IN);
      expect(result.stayStart).toBe(stayStart.toISOString());
      expect(result.stayEnd).toBe(stayEnd.toISOString());
      expect(result.guestName).toBe('John Doe');
      expect(result.verifiedAt).toBeDefined();
    });
  });
});
