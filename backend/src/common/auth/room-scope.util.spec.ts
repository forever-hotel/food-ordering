import { ForbiddenException } from '@nestjs/common';
import type { GuestContext } from '../../modules/guest-sessions/interfaces/guest-context.interface.js';
import {
  assertBookingScope,
  assertRoomScope,
  bindServerAuthoritativeRoom,
} from './room-scope.util.js';

describe('RoomScopeUtil', () => {
  const validGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: 'booking-uuid-101',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    role: 'GUEST',
  };

  describe('assertRoomScope', () => {
    it('allows access when roomNumber matches authenticated guest', () => {
      expect(() => assertRoomScope(validGuest, '101')).not.toThrow();
      expect(() => assertRoomScope(validGuest, ' 101 ')).not.toThrow();
    });

    it('throws ForbiddenException when target room differs (cross-room IDOR attempt)', () => {
      expect(() => assertRoomScope(validGuest, '102')).toThrow(
        ForbiddenException,
      );
      expect(() => assertRoomScope(validGuest, '102', 'FoodOrder')).toThrow(
        'Access denied: You are not authorized to access FoodOrder belonging to another room.',
      );
    });

    it('throws ForbiddenException when guest context is missing or invalid', () => {
      expect(() =>
        assertRoomScope(null as unknown as GuestContext, '101'),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertRoomScope({} as unknown as GuestContext, '101'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertBookingScope', () => {
    it('allows access when bookingId matches authenticated guest', () => {
      expect(() =>
        assertBookingScope(validGuest, 'booking-uuid-101'),
      ).not.toThrow();
    });

    it('throws ForbiddenException when bookingId differs (cross-booking IDOR attempt)', () => {
      expect(() => assertBookingScope(validGuest, 'booking-uuid-102')).toThrow(
        ForbiddenException,
      );
      expect(() =>
        assertBookingScope(validGuest, 'booking-uuid-102', 'ServiceRequest'),
      ).toThrow(
        'Access denied: You are not authorized to access ServiceRequest belonging to another booking.',
      );
    });

    it('throws ForbiddenException when guest context is missing bookingId', () => {
      expect(() =>
        assertBookingScope({} as unknown as GuestContext, 'booking-uuid-101'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('bindServerAuthoritativeRoom', () => {
    it('overrides caller-supplied room with authenticated guest room', () => {
      const callerPayload = {
        item: 'Club Sandwich',
        quantity: 2,
        roomNumber: '999', // Spoofed room from client!
      };

      const securePayload = bindServerAuthoritativeRoom(
        validGuest,
        callerPayload,
      );

      expect(securePayload.roomNumber).toBe('101'); // Overwritten by session room
      expect(securePayload.bookingId).toBe('booking-uuid-101');
      expect(securePayload.item).toBe('Club Sandwich');
      expect(securePayload.quantity).toBe(2);
    });

    it('throws ForbiddenException if guest context lacks required room or booking', () => {
      expect(() =>
        bindServerAuthoritativeRoom({} as unknown as GuestContext, {}),
      ).toThrow(ForbiddenException);
    });
  });
});
