import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { BookingVerificationService } from './booking-verification.service.js';
import { BookingController } from './booking.controller.js';
import { BookingStatus } from './enums/booking-status.enum.js';

describe('BookingController', () => {
  let controller: BookingController;
  let service: {
    verifyStay: jest.MockedFunction<BookingVerificationService['verifyStay']>;
  };

  beforeEach(() => {
    service = {
      verifyStay: jest.fn(),
    };

    controller = new BookingController(
      service as unknown as BookingVerificationService,
    );
  });

  describe('verifyBooking', () => {
    it('throws BadRequestException when body is null or not an object', async () => {
      await expect(
        controller.verifyBooking(
          null as unknown as { bookingId: string; roomNumber: string },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to service and returns verification result', async () => {
      const mockResult = {
        valid: true,
        bookingId: 'b-101',
        roomNumber: '101',
        status: BookingStatus.CHECKED_IN,
        stayStart: '2026-10-27T10:00:00.000Z',
        stayEnd: '2026-10-30T10:00:00.000Z',
        verifiedAt: '2026-10-28T12:00:00.000Z',
      };

      service.verifyStay.mockResolvedValue(mockResult);

      const response = await controller.verifyBooking({
        bookingId: 'b-101',
        roomNumber: '101',
      });

      expect(service.verifyStay).toHaveBeenCalledWith('b-101', '101');
      expect(response).toEqual(mockResult);
    });
  });
});
