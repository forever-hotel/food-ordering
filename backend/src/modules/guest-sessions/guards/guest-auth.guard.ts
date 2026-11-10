import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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
    let authSource: 'bearer' | 'cookie' | 'query' = 'bearer';

    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.trim().split(' ');
      if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
        throw new UnauthorizedException(
          'Malformed Authorization header. Format: Bearer <token>',
        );
      }
      token = parts[1];
      authSource = 'bearer';
    } else if (request.headers?.cookie) {
      token = extractTokenFromCookies(request.headers.cookie);
      if (token) authSource = 'cookie';
    }

    if (!token && request.cookies?.foss_guest_session) {
      token = request.cookies.foss_guest_session;
      authSource = 'cookie';
    }

    if (!token && isSseRequest && queryToken) {
      token = queryToken;
      authSource = 'query';
    }

    if (!token) {
      throw new UnauthorizedException(
        'Authorization header with Bearer token is required.',
      );
    }

    // CSRF Protection: When authenticating via ambient cookie, protect state-changing HTTP methods
    const method = (request.method || 'GET').toUpperCase();
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (authSource === 'cookie' && isStateChanging) {
      this.validateCsrf(request);
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

  private validateCsrf(request: any): void {
    // 1. Safe custom header check: standard cross-origin form POSTs cannot attach custom headers
    const customHeader =
      request.headers?.['x-requested-with'] ||
      request.headers?.['x-foss-client'];
    if (customHeader) {
      return;
    }

    // 2. Origin or Referer header validation
    const origin = request.headers?.['origin'] || request.headers?.['referer'];
    if (!origin || typeof origin !== 'string') {
      throw new ForbiddenException(
        'CSRF validation failed: Missing origin or custom request header.',
      );
    }

    let originHostname: string;
    let originPort: string;
    try {
      const parsed = new URL(origin);
      originHostname = parsed.hostname.toLowerCase();
      originPort = parsed.port;
    } catch {
      throw new ForbiddenException('CSRF validation failed: Malformed origin.');
    }

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4200',
      'http://localhost:4300',
    ].filter(Boolean) as string[];

    const hostHeader = request.headers?.['host'];
    if (hostHeader) {
      allowedOrigins.push(`http://${hostHeader}`, `https://${hostHeader}`);
    }

    const isMatch = allowedOrigins.some((allowed) => {
      try {
        const parsed = new URL(allowed);
        return (
          parsed.hostname.toLowerCase() === originHostname &&
          (parsed.port === originPort || (!parsed.port && !originPort))
        );
      } catch {
        return false;
      }
    });

    if (!isMatch) {
      throw new ForbiddenException(
        `CSRF validation failed: Untrusted origin [${origin}].`,
      );
    }
  }
}
