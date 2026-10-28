import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { GuestContext } from '../interfaces/guest-context.interface.js';
import { GuestSessionsService } from '../services/guest-sessions.service.js';

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(private readonly guestSessionsService: GuestSessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException(
        'Authorization header with Bearer token is required.',
      );
    }

    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
      throw new UnauthorizedException(
        'Malformed Authorization header. Format: Bearer <token>',
      );
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedException('Bearer token must not be empty.');
    }

    const { session, stay } =
      await this.guestSessionsService.validateSessionToken(token);

    const guestContext: GuestContext = {
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      guestId: session.sessionId,
      roomNumber: session.roomNumber,
      guestName: stay.guestName,
      stayStart: stay.stayStart,
      stayEnd: stay.stayEnd,
      role: 'GUEST',
    };

    request.guest = guestContext;
    request.sessionRecord = session;
    request.sessionToken = token;

    return true;
  }
}
