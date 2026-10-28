import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MockBookingAdapter } from './mock-booking.adapter.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

describe('MockBookingAdapter', () => {
  let adapter: MockBookingAdapter;
  const mockNow = new Date('2026-10-28T12:00:00.000Z');

  beforeEach(() => {
    adapter = new MockBookingAdapter(() => mockNow, {
      'booking-101': {
        bookingId: 'booking-101',
        roomNumber: '101',
        status: BookingStatus.CHECKED_IN,
        stayStart: new Date('2026-10-27T12:00:00.000Z'),
        stayEnd: new Date('2026-10-29T12:00:00.000Z'),
        guestName: 'Verified Guest 101',
      },
      'booking-102': {
        bookingId: 'booking-102',
        roomNumber: '102',
        status: BookingStatus.RESERVED,
        stayStart: new Date('2026-10-29T14:00:00.000Z'),
        stayEnd: new Date('2026-10-31T12:00:00.000Z'),
        guestName: 'Future Guest 102',
      },
      'booking-103': {
        bookingId: 'booking-103',
        roomNumber: '103',
        status: BookingStatus.CHECKED_OUT,
        stayStart: new Date('2026-10-25T12:00:00.000Z'),
        stayEnd: new Date('2026-10-27T12:00:00.000Z'),
        guestName: 'Departed Guest 103',
      },
      'booking-104': {
        bookingId: 'booking-104',
        roomNumber: '104',
        status: BookingStatus.CANCELLED,
        stayStart: new Date('2026-10-27T12:00:00.000Z'),
        stayEnd: new Date('2026-10-29T12:00:00.000Z'),
        guestName: 'Cancelled Guest 104',
      },
      'booking-105-expired': {
        bookingId: 'booking-105-expired',
        roomNumber: '105',
        status: BookingStatus.CHECKED_IN,
        stayStart: new Date('2026-10-25T12:00:00.000Z'),
        stayEnd: new Date('2026-10-28T10:00:00.000Z'), // Expired 2h ago
        guestName: 'Expired Stay Guest 105',
      },
      'booking-skew': {
        bookingId: 'booking-skew',
        roomNumber: '106',
        status: BookingStatus.CHECKED_IN,
        stayStart: new Date('2026-10-27T12:00:00.000Z'),
        stayEnd: new Date('2026-10-28T11:50:00.000Z'), // 10 minutes ago, within 15m skew grace
        guestName: 'Skew Guest 106',
      },
      'booking-future-start': {
        bookingId: 'booking-future-start',
        roomNumber: '107',
        status: BookingStatus.CHECKED_IN,
        stayStart: new Date('2026-10-28T14:00:00.000Z'), // 2 hours in the future
        stayEnd: new Date('2026-10-30T12:00:00.000Z'),
        guestName: 'Premature Access Guest 107',
      },
      'booking-other-status': {
        bookingId: 'booking-other-status',
        roomNumber: '108',
        status: 'UNKNOWN_STATUS' as unknown as BookingStatus,
        stayStart: new Date('2026-10-27T12:00:00.000Z'),
        stayEnd: new Date('2026-10-29T12:00:00.000Z'),
      },
    });
  });

  describe('getBookingById', () => {
    it('returns the booking record when it exists', async () => {
      const record = await adapter.getBookingById('booking-101');
      expect(record).not.toBeNull();
      expect(record?.roomNumber).toBe('101');
      expect(record?.status).toBe(BookingStatus.CHECKED_IN);
    });

    it('returns null when booking does not exist', async () => {
      const record = await adapter.getBookingById('non-existent');
      expect(record).toBeNull();
    });
  });

  describe('verifyBooking table-driven tests', () => {
    it('AC1: passes for valid checked-in booking with matching room within stay window', async () => {
      const record = await adapter.verifyBooking('booking-101', '101');
      expect(record.bookingId).toBe('booking-101');
      expect(record.roomNumber).toBe('101');
      expect(record.status).toBe(BookingStatus.CHECKED_IN);
      expect(record.guestName).toBe('Verified Guest 101');
    });

    it('AC2: fails with NotFoundException when booking ID is unknown', async () => {
      await expect(adapter.verifyBooking('unknown-id', '101')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('AC2: fails with ForbiddenException on room mismatch', async () => {
      await expect(adapter.verifyBooking('booking-101', '999')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('AC2: fails with ForbiddenException for RESERVED status', async () => {
      await expect(adapter.verifyBooking('booking-102', '102')).rejects.toThrow(
        /RESERVED/,
      );
    });

    it('AC2: fails with ForbiddenException for CHECKED_OUT status', async () => {
      await expect(adapter.verifyBooking('booking-103', '103')).rejects.toThrow(
        /CHECKED_OUT/,
      );
    });

    it('AC2: fails with ForbiddenException for CANCELLED status', async () => {
      await expect(adapter.verifyBooking('booking-104', '104')).rejects.toThrow(
        /CANCELLED/,
      );
    });

    it('AC2: fails with ForbiddenException for unrecognized stay status', async () => {
      await expect(
        adapter.verifyBooking('booking-other-status', '108'),
      ).rejects.toThrow(/not authorized for in-room services/);
    });

    it('AC3: fails with ForbiddenException when stay window has expired beyond grace period', async () => {
      await expect(
        adapter.verifyBooking('booking-105-expired', '105'),
      ).rejects.toThrow(/Stay window has expired/);
    });

    it('AC3: fails with ForbiddenException when stay window has not yet commenced', async () => {
      await expect(
        adapter.verifyBooking('booking-future-start', '107'),
      ).rejects.toThrow(/Stay window has not commenced/);
    });

    it('AC3: passes within the 15-minute clock skew grace window', async () => {
      const record = await adapter.verifyBooking('booking-skew', '106');
      expect(record.bookingId).toBe('booking-skew');
    });

    it('defaults to built-in fixtures when no custom fixtures are supplied', async () => {
      const defaultAdapter = new MockBookingAdapter();
      const record = await defaultAdapter.getBookingById(
        'b1010000-0000-4000-8000-000000000101',
      );
      expect(record).not.toBeNull();
      expect(record?.roomNumber).toBe('101');
    });

    it('simulates checkout by marking booking CHECKED_OUT', async () => {
      const updated = await adapter.checkoutBooking('booking-101');
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe(BookingStatus.CHECKED_OUT);

      const notFound = await adapter.checkoutBooking('non-existent');
      expect(notFound).toBeNull();
    });

    it('simulates room reassignment by updating roomNumber', async () => {
      const updated = await adapter.reassignRoom('booking-101', '109');
      expect(updated).not.toBeNull();
      expect(updated?.roomNumber).toBe('109');

      const notFound = await adapter.reassignRoom('non-existent', '109');
      expect(notFound).toBeNull();
    });
  });
});
