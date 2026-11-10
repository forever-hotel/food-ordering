import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { GuestContext } from '../interfaces/guest-context.interface.js';
import { GuestSessionsService } from '../services/guest-sessions.service.js';

function extractTokenFromCookies(cookieHeader?: string): string | undefined {
  if (!cookieHeader || typeof cookieHeader !== 'string') return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      if (key === 'foss_guest_session') {
        const val = pair.slice(idx + 1).trim();
        return decodeURIComponent(val);
      }
    }
  }
  return undefined;
}

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(private readonly guestSessionsService: GuestSessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    const queryToken =
      typeof request.query?.token === 'string'
        ? request.query.token.trim()
        : undefined;

    const isSseRequest = Boolean(
      (typeof request.headers?.accept === 'string' &&
        request.headers.accept.includes('text/event-stream')) ||
      (typeof request.path === 'string' &&
        request.path.includes('/realtime/events/stream')) ||
      (typeof request.url === 'string' &&
        request.url.includes('/realtime/events/stream')),
    );

    let token: string | undefined;

    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.trim().split(' ');
      if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
        throw new UnauthorizedException(
          'Malformed Authorization header. Format: Bearer <token>',
        );
      }
      token = parts[1];
    } else if (request.headers?.cookie) {
      token = extractTokenFromCookies(request.headers.cookie);
    }

    if (!token && request.cookies?.foss_guest_session) {
      token = request.cookies.foss_guest_session;
    }

    if (!token && isSseRequest && queryToken) {
      token = queryToken;
    }

    if (!token) {
      throw new UnauthorizedException(
        'Authorization header with Bearer token is required.',
      );
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
