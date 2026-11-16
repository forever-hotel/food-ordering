import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { GuestContext } from '../../modules/guest-sessions/interfaces/guest-context.interface.js';
import { RoomOwnershipGuard } from './room-ownership.guard.js';

describe('RoomOwnershipGuard', () => {
  let guard: RoomOwnershipGuard;

  const validGuest: GuestContext = {
    sessionId: 'session-101',
    bookingId: 'booking-101',
    guestId: 'guest-101',
    roomNumber: '101',
    role: 'GUEST',
  };

  const createMockContext = (
    guest?: GuestContext,
    params: Record<string, string> = {},
    query: Record<string, string> = {},
    body: Record<string, unknown> = {},
  ): ExecutionContext => {
    const request = {
      guest,
      params,
      query,
      body,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    guard = new RoomOwnershipGuard();
  });

  it('allows access when roomNumber matches in path params', () => {
    const context = createMockContext(validGuest, { roomNumber: '101' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when roomNumber matches in query params', () => {
    const context = createMockContext(validGuest, {}, { roomNumber: '101' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when roomNumber matches in body', () => {
    const context = createMockContext(
      validGuest,
      {},
      {},
      { roomNumber: '101' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when bookingId matches in path params', () => {
    const context = createMockContext(validGuest, { bookingId: 'booking-101' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects cross-room access when params.roomNumber differs', () => {
    const context = createMockContext(validGuest, { roomNumber: '102' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects cross-room access when query.roomNumber differs', () => {
    const context = createMockContext(validGuest, {}, { roomNumber: '102' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects cross-room access when body.roomNumber differs', () => {
    const context = createMockContext(
      validGuest,
      {},
      {},
      { roomNumber: '102' },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects cross-booking access when params.bookingId differs', () => {
    const context = createMockContext(validGuest, { bookingId: 'booking-999' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when guest context is missing', () => {
    const context = createMockContext(undefined, { roomNumber: '101' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
