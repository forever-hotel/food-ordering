import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { GuestContext } from '../../modules/guest-sessions/interfaces/guest-context.interface.js';
import { assertBookingScope, assertRoomScope } from './room-scope.util.js';

interface RequestWithGuest extends Request {
  guest?: GuestContext;
}

/**
 * Guard that verifies any room or booking parameter in URL params, query,
 * or body strictly matches the authenticated guest's room and booking.
 * Prevents Insecure Direct Object Reference (IDOR) attacks.
 */
@Injectable()
export class RoomOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithGuest>();
    const guest = request.guest;

    if (!guest) {
      throw new ForbiddenException(
        'Room ownership verification requires an authenticated guest context.',
      );
    }

    // 1. Check room parameter if specified in path, query, or body
    const targetRoom =
      request.params?.roomNumber ||
      request.query?.roomNumber ||
      request.body?.roomNumber;

    if (targetRoom && typeof targetRoom === 'string') {
      assertRoomScope(guest, targetRoom, 'room-scoped resource');
    }

    // 2. Check booking parameter if specified in path, query, or body
    const targetBooking =
      request.params?.bookingId ||
      request.query?.bookingId ||
      request.body?.bookingId;

    if (targetBooking && typeof targetBooking === 'string') {
      assertBookingScope(guest, targetBooking, 'booking-scoped resource');
    }

    return true;
  }
}
