import { jest } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { BookingVerificationResultDto } from '../../../integrations/internal-services/booking/dto/booking-verification-result.dto.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { GuestSessionsService } from '../services/guest-sessions.service.js';
import { GuestAuthGuard } from './guest-auth.guard.js';

describe('GuestAuthGuard', () => {
  let guard: GuestAuthGuard;
  let mockGuestSessionsService: {
    validateSessionToken: jest.MockedFunction<
      (token: string) => Promise<{
        session: FossSession;
        stay: BookingVerificationResultDto;
      }>
    >;
  };

  const createMockContext = (
    headers: Record<string, string>,
    query?: Record<string, string>,
    path?: string,
    url?: string,
  ): ExecutionContext => {
    const request: {
      headers: Record<string, string>;
      query?: Record<string, string>;
      path?: string;
      url?: string;
      guest?: unknown;
      sessionRecord?: unknown;
      sessionToken?: unknown;
    } = { headers, query, path, url };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockGuestSessionsService = {
      validateSessionToken: jest.fn<
        () => Promise<{
          session: FossSession;
          stay: BookingVerificationResultDto;
        }>
      >(),
    };

    guard = new GuestAuthGuard(
      mockGuestSessionsService as unknown as GuestSessionsService,
    );
  });

  it('allows access and attaches guest context for valid Bearer token', async () => {
    const session = new FossSession();
    session.sessionId = 'sess-123';
    session.bookingId = 'book-456';
    session.roomNumber = '101';

    const stay: BookingVerificationResultDto = {
      valid: true,
      bookingId: 'book-456',
      roomNumber: '101',
      status: 'CHECKED_IN',
      stayStart: '2026-10-27T10:00:00Z',
      stayEnd: '2026-10-30T10:00:00Z',
      guestName: 'John Smith',
      verifiedAt: new Date().toISOString(),
    };

    mockGuestSessionsService.validateSessionToken.mockResolvedValue({
      session,
      stay,
    });

    const context = createMockContext({
      authorization: 'Bearer valid-session-token',
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.guest).toEqual({
      sessionId: 'sess-123',
      bookingId: 'book-456',
      guestId: 'sess-123',
      roomNumber: '101',
      guestName: 'John Smith',
      stayStart: '2026-10-27T10:00:00Z',
      stayEnd: '2026-10-30T10:00:00Z',
      role: 'GUEST',
    });
    expect(request.sessionToken).toBe('valid-session-token');
  });

  it('throws UnauthorizedException when authorization header is missing', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for malformed authorization format', async () => {
    const context = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when Bearer token is empty', async () => {
    const context = createMockContext({ authorization: 'Bearer ' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('bubbles up UnauthorizedException when session validation fails', async () => {
    mockGuestSessionsService.validateSessionToken.mockRejectedValue(
      new UnauthorizedException('Session expired'),
    );

    const context = createMockContext({
      authorization: 'Bearer expired-session-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows access for SSE stream endpoint with query token when Bearer header is absent', async () => {
    const session = new FossSession();
    session.sessionId = 'sess-sse-1';
    session.bookingId = 'book-sse-1';
    session.roomNumber = '102';

    const stay: BookingVerificationResultDto = {
      valid: true,
      bookingId: 'book-sse-1',
      roomNumber: '102',
      status: 'CHECKED_IN',
      stayStart: '2026-10-27T10:00:00Z',
      stayEnd: '2026-10-30T10:00:00Z',
      guestName: 'Jane Doe',
      verifiedAt: new Date().toISOString(),
    };

    mockGuestSessionsService.validateSessionToken.mockResolvedValue({
      session,
      stay,
    });

    const context = createMockContext(
      { accept: 'text/event-stream' },
      { token: 'valid-sse-token' },
      '/realtime/events/stream',
    );

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.guest).toEqual({
      sessionId: 'sess-sse-1',
      bookingId: 'book-sse-1',
      guestId: 'sess-sse-1',
      roomNumber: '102',
      guestName: 'Jane Doe',
      stayStart: '2026-10-27T10:00:00Z',
      stayEnd: '2026-10-30T10:00:00Z',
      role: 'GUEST',
    });
    expect(request.sessionToken).toBe('valid-sse-token');
  });

  it('throws UnauthorizedException when query token is passed to a non-SSE endpoint', async () => {
    const context = createMockContext(
      {},
      { token: 'valid-token' },
      '/orders',
      '/orders?token=valid-token',
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(
      mockGuestSessionsService.validateSessionToken,
    ).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when query token is empty string on SSE endpoint', async () => {
    const context = createMockContext(
      { accept: 'text/event-stream' },
      { token: '   ' },
      '/realtime/events/stream',
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(
      mockGuestSessionsService.validateSessionToken,
    ).not.toHaveBeenCalled();
  });
});
