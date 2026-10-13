import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  type BookingProvider,
  type BookingRecord,
} from '../interfaces/booking-verification.interface.js';
import { BookingVerificationService } from './booking-verification.service.js';

describe('BookingVerificationService', () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';

  const validBooking = (): BookingRecord => ({
    bookingId,
    roomNumber: '101',
    status: 'CHECKED_IN',
    checkInDate: new Date('2026-01-01T00:00:00.000Z'),
    checkOutDate: new Date('2027-01-01T00:00:00.000Z'),
  });

  let findById: jest.MockedFunction<BookingProvider['findById']>;
  let service: BookingVerificationService;

  beforeEach(() => {
    findById = jest.fn<BookingProvider['findById']>();
    findById.mockResolvedValue(validBooking());

    service = new BookingVerificationService({
      findById,
    });
  });

  it('accepts a valid checked-in booking', async () => {
    await expect(service.verifyBooking(bookingId, '101')).resolves.toEqual({
      bookingId,
      roomNumber: '101',
    });

    expect(findById).toHaveBeenCalledWith(bookingId);
  });

  it('rejects empty booking IDs', async () => {
    await expect(service.verifyBooking('', '101')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects empty room numbers', async () => {
    await expect(service.verifyBooking(bookingId, '')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a missing booking', async () => {
    findById.mockResolvedValue(null);

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unexpected booking ID', async () => {
    findById.mockResolvedValue({
      ...validBooking(),
      bookingId: '99999999-9999-4999-8999-999999999999',
    });

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['RESERVED', 'CANCELLED', 'CHECKED_OUT'] as const)(
    'rejects %s bookings',
    async (status) => {
      findById.mockResolvedValue({
        ...validBooking(),
        status,
      });

      await expect(
        service.verifyBooking(bookingId, '101'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('rejects a room mismatch', async () => {
    await expect(
      service.verifyBooking(bookingId, '999'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a booking before check-in', async () => {
    findById.mockResolvedValue({
      ...validBooking(),
      checkInDate: new Date('2099-01-01T00:00:00.000Z'),
    });

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a booking after checkout', async () => {
    findById.mockResolvedValue({
      ...validBooking(),
      checkOutDate: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid booking dates', async () => {
    findById.mockResolvedValue({
      ...validBooking(),
      checkOutDate: new Date('invalid'),
    });

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails securely when the provider is unavailable', async () => {
    findById.mockRejectedValue(new Error('Connection refused'));

    await expect(
      service.verifyBooking(bookingId, '101'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
