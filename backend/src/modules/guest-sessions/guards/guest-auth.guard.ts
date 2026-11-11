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
  let legacyToken: string | undefined;
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (!val) continue;
      if (key === 'foss_session') {
        return decodeURIComponent(val);
      }
      if (key === 'foss_guest_session' && !legacyToken) {
        legacyToken = decodeURIComponent(val);
      }
    }
  }
  return legacyToken;
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

    if (!token && request.cookies?.foss_session) {
      token = request.cookies.foss_session;
      authSource = 'cookie';
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
    request.authSource = authSource;

    return true;
  }

  private validateCsrf(request: any): void {
    const origin = request.headers?.['origin'] || request.headers?.['referer'];
    const customHeader =
      request.headers?.['x-foss-client'] ||
      request.headers?.['x-requested-with'];

    // 1. Strict Origin / Referer Validation:
    // If an Origin or Referer is attached (as modern browsers do on all cross-origin or POST requests),
    // it MUST match the strict allowed origin list. An arbitrary custom header CANNOT bypass an untrusted origin.
    if (origin && typeof origin === 'string') {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new ForbiddenException(
          'CSRF validation failed: Malformed origin.',
        );
      }

      if (!this.isAllowedOrigin(parsedOrigin)) {
        throw new ForbiddenException(
          `CSRF validation failed: Untrusted origin [${origin}].`,
        );
      }
      return;
    }

    // 2. If neither Origin nor Referer is present:
    // Standard cross-site form POSTs in browsers always send Origin/Referer.
    // In scenarios where origin is absent (e.g. controlled non-browser test callers), require the custom header.
    if (!customHeader) {
      throw new ForbiddenException(
        'CSRF validation failed: Missing origin or custom request header.',
      );
    }
  }

  private isAllowedOrigin(parsedOrigin: URL): boolean {
    const originProto = parsedOrigin.protocol.toLowerCase();
    const originHost = parsedOrigin.hostname.toLowerCase();
    const originPort =
      parsedOrigin.port || (originProto === 'https:' ? '443' : '80');

    // Build strict allowed origin candidates from explicit configuration
    const rawAllowed: string[] = [
      process.env.FRONTEND_URL,
      process.env.FOSS_FRONTEND_URL,
      process.env.FOSS_PUBLIC_APP_URL,
      process.env.APP_BASE_URL,
    ].filter(Boolean) as string[];

    if (process.env.ALLOWED_ORIGINS) {
      const parts = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      rawAllowed.push(...parts);
    }

    if (process.env.NODE_ENV !== 'production') {
      rawAllowed.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'http://localhost:4300',
        'http://127.0.0.1:4300',
        'https://localhost:3000',
        'https://127.0.0.1:3000',
      );
    }

    for (const allowed of rawAllowed) {
      try {
        const parsed = new URL(allowed);
        const expectedProto = parsed.protocol.toLowerCase();
        const expectedHost = parsed.hostname.toLowerCase();
        const expectedPort =
          parsed.port || (expectedProto === 'https:' ? '443' : '80');

        if (
          expectedProto === originProto &&
          expectedHost === originHost &&
          expectedPort === originPort
        ) {
          return true;
        }
      } catch {
        // Skip unparseable configuration entries
      }
    }

    return false;
  }
}
