import { ForbiddenException, Logger } from '@nestjs/common';
import type { GuestContext } from '../../modules/guest-sessions/interfaces/guest-context.interface.js';

const logger = new Logger('RoomScopeSecurity');

/**
 * Validates that the authenticated guest owns the specified room.
 * Rejects cross-room access with a safe ForbiddenException (Anti-IDOR).
 */
export function assertRoomScope(
  guest: GuestContext,
  targetRoomNumber: string,
  resourceName: string = 'Resource',
): void {
  if (!guest || !guest.roomNumber) {
    logger.warn(
      'assertRoomScope failed: GuestContext is missing or has no roomNumber.',
    );
    throw new ForbiddenException(
      'Access denied: Authentication context is invalid.',
    );
  }

  const cleanTarget = targetRoomNumber?.trim();
  const cleanGuestRoom = guest.roomNumber.trim();

  if (cleanGuestRoom !== cleanTarget) {
    logger.warn(
      `Cross-room access attempt blocked! Guest in room [${cleanGuestRoom}] attempted to access ${resourceName} for room [${cleanTarget}]`,
    );
    throw new ForbiddenException(
      `Access denied: You are not authorized to access ${resourceName} belonging to another room.`,
    );
  }
}

/**
 * Validates that the authenticated guest owns the specified booking.
 * Rejects cross-booking access with a safe ForbiddenException.
 */
export function assertBookingScope(
  guest: GuestContext,
  targetBookingId: string,
  resourceName: string = 'Resource',
): void {
  if (!guest || !guest.bookingId) {
    logger.warn(
      'assertBookingScope failed: GuestContext is missing or has no bookingId.',
    );
    throw new ForbiddenException(
      'Access denied: Authentication context is invalid.',
    );
  }

  const cleanTarget = targetBookingId?.trim();
  const cleanGuestBooking = guest.bookingId.trim();

  if (cleanGuestBooking !== cleanTarget) {
    logger.warn(
      `Cross-booking access attempt blocked! Guest with booking [${cleanGuestBooking}] attempted to access ${resourceName} for booking [${cleanTarget}]`,
    );
    throw new ForbiddenException(
      `Access denied: You are not authorized to access ${resourceName} belonging to another booking.`,
    );
  }
}

/**
 * Enforces server-authoritative room binding by replacing or guaranteeing
 * the roomNumber field using the verified session context.
 * Never trusts caller-supplied roomNumber.
 */
export function bindServerAuthoritativeRoom<T extends Record<string, unknown>>(
  guest: GuestContext,
  payload: T,
): T & { roomNumber: string; bookingId: string } {
  if (!guest || !guest.roomNumber || !guest.bookingId) {
    throw new ForbiddenException('Invalid guest session context.');
  }

  return {
    ...payload,
    roomNumber: guest.roomNumber,
    bookingId: guest.bookingId,
  };
}
