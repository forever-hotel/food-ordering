import { jest } from '@jest/globals';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RealBookingAdapter } from './real-booking.adapter.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

describe('RealBookingAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('configuration & fail-closed behavior', () => {
    it('fails closed with ServiceUnavailableException when baseUrl is missing or empty', async () => {
      const adapter = new RealBookingAdapter('');
      await expect(adapter.verifyBooking('b-1', '101')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('fails closed when baseUrl is undefined', async () => {
      const adapter = new RealBookingAdapter(undefined);
      await expect(adapter.getBookingById('b-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('HTTP operations with upstream mock responses', () => {
    const baseUrl = 'https://fds.internal.example.com';
    const apiKey = 'test-token-123';
    let adapter: RealBookingAdapter;

    beforeEach(() => {
      adapter = new RealBookingAdapter(baseUrl, apiKey, 2000);
    });

    it('AC1: successfully verifies checked-in booking via upstream HTTP call', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bookingId: 'b-101',
          roomNumber: '101',
          status: 'CHECKED_IN',
          stayStart: '2026-10-27T10:00:00.000Z',
          stayEnd: '2026-10-30T10:00:00.000Z',
          guestName: 'Real Guest',
        }),
      })) as unknown as typeof fetch;

      const record = await adapter.verifyBooking('b-101', '101');
      expect(record.bookingId).toBe('b-101');
      expect(record.roomNumber).toBe('101');
      expect(record.status).toBe(BookingStatus.CHECKED_IN);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://fds.internal.example.com/api/v1/bookings/b-101/verify',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      );
    });

    it('AC1: successfully fetches booking by ID via upstream HTTP call', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bookingId: 'b-101',
          roomNumber: '101',
          status: 'CHECKED_IN',
          stayStart: '2026-10-27T10:00:00.000Z',
          stayEnd: '2026-10-30T10:00:00.000Z',
          guestName: 'Real Guest',
        }),
      })) as unknown as typeof fetch;

      const record = await adapter.getBookingById('b-101');
      expect(record).not.toBeNull();
      expect(record?.bookingId).toBe('b-101');
      expect(record?.roomNumber).toBe('101');
    });

    it('AC2: throws NotFoundException when upstream returns 404', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 404,
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-unknown', '101')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('AC2: returns null for getBookingById when upstream returns 404', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 404,
      })) as unknown as typeof fetch;

      const result = await adapter.getBookingById('b-unknown');
      expect(result).toBeNull();
    });

    it('AC2: throws ForbiddenException when upstream returns 403', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 403,
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-102', '102')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('AC2: throws ForbiddenException when upstream returns 400 Bad Request', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 400,
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-102', '102')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('AC2: throws ServiceUnavailableException on upstream 500 error in verifyBooking', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-101', '101')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('AC2: throws ServiceUnavailableException on upstream 500 error in getBookingById', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      await expect(adapter.getBookingById('b-101')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('AC2: throws ServiceUnavailableException on upstream fetch rejection/timeout', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('Connection timed out');
      }) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-101', '101')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('AC3: throws ServiceUnavailableException on malformed payload', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          incomplete: 'payload',
        }),
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-101', '101')).rejects.toThrow(
        /Malformed stay verification payload/,
      );
    });

    it('AC3: throws ServiceUnavailableException on invalid date timestamps in payload', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bookingId: 'b-101',
          roomNumber: '101',
          status: 'CHECKED_IN',
          stayStart: 'not-a-valid-date',
          stayEnd: 'also-not-valid',
        }),
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-101', '101')).rejects.toThrow(
        /Invalid stay timestamps received from upstream provider/,
      );
    });

    it('AC3: throws ForbiddenException if upstream returns different room number', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bookingId: 'b-101',
          roomNumber: '102', // Mismatch!
          status: 'CHECKED_IN',
          stayStart: '2026-10-27T10:00:00.000Z',
          stayEnd: '2026-10-30T10:00:00.000Z',
        }),
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-101', '101')).rejects.toThrow(
        /Room number mismatch/,
      );
    });

    it('AC3: throws ForbiddenException if upstream status is not CHECKED_IN', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bookingId: 'b-102',
          roomNumber: '102',
          status: 'RESERVED',
          stayStart: '2026-10-27T10:00:00.000Z',
          stayEnd: '2026-10-30T10:00:00.000Z',
        }),
      })) as unknown as typeof fetch;

      await expect(adapter.verifyBooking('b-102', '102')).rejects.toThrow(
        /not CHECKED_IN/,
      );
    });
  });
});
