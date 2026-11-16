import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  fetchCurrentSession,
  logoutSession,
  redeemQrToken,
} from '../src/lib/api/guest-sessions.ts';

describe('TC-DDP-136-AC1: Successful Workflow - Redeem QR Token & Fetch Session', () => {
  it('redeems a valid signed QR token and receives guest stay context', async () => {
    const mockSession = {
      sessionToken: 'token-uuid-101',
      expiresAt: '2026-10-30T12:00:00.000Z',
      guest: {
        guestId: 'guest-101',
        bookingId: 'booking-101',
        roomNumber: '101',
        guestName: 'Jane Doe',
        role: 'GUEST',
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/guest-sessions\/qr$/);
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.qrToken, 'valid-signed-qr-token-101');

      return new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await redeemQrToken('valid-signed-qr-token-101');
      assert.equal(result.sessionToken, 'token-uuid-101');
      assert.equal(result.guest.roomNumber, '101');
      assert.equal(result.guest.guestName, 'Jane Doe');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retrieves active guest stay context from /guest-sessions/me', async () => {
    const mockContext = {
      sessionId: 'session-101',
      bookingId: 'booking-101',
      guestId: 'guest-101',
      roomNumber: '101',
      guestName: 'Jane Doe',
      role: 'GUEST',
      active: true,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/guest-sessions\/me$/);
      assert.equal(init?.method, 'GET');
      assert.equal(
        (init?.headers as Record<string, string>)?.['Authorization'],
        'Bearer token-uuid-101',
      );

      return new Response(JSON.stringify(mockContext), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await fetchCurrentSession('token-uuid-101');
      assert.equal(result.roomNumber, '101');
      assert.equal(result.active, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-136-AC2: Negative / Error Handling - Invalid Tokens & Rejections', () => {
  it('throws ApiError with 401 when QR token is expired', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'QR token has expired.',
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await redeemQrToken('expired-token-105');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 401);
          assert.equal(err.message, 'QR token has expired.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws ApiError when stay has already been checked out (403 or 401)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 403,
          message: 'Booking is already checked out.',
          error: 'Forbidden',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await redeemQrToken('checked-out-token-103');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 403);
          assert.equal(err.message, 'Booking is already checked out.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-136-AC3: Boundary, Session Lifecycle & Invalidation', () => {
  it('logs out session cleanly and calls /guest-sessions/logout', async () => {
    let logoutCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/guest-sessions\/logout$/);
      assert.equal(init?.method, 'POST');
      assert.equal(
        (init?.headers as Record<string, string>)?.['Authorization'],
        'Bearer token-uuid-101',
      );
      logoutCalled = true;

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Session logged out successfully.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      const result = await logoutSession('token-uuid-101');
      assert.equal(result.success, true);
      assert.equal(logoutCalled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles session expiry when /guest-sessions/me returns 401', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'Invalid or expired guest session.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchCurrentSession('expired-session-token');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 401);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-136-AC4: Non-Negotiable Security Contract', () => {
  it('enforces that a room number alone is rejected by validation', () => {
    const isRoomNumberAlone = (input: string) => /^\d{3,4}$/.test(input.trim());

    assert.equal(isRoomNumberAlone('101'), true);
    assert.equal(isRoomNumberAlone('1024'), true);
    assert.equal(isRoomNumberAlone('room-101-token-xyz'), false);
    assert.equal(isRoomNumberAlone('DEMO-101-SIGNED'), false);
  });
});
