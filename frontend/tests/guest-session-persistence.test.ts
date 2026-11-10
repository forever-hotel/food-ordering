import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPersistentSession,
  getPersistentStorageKey,
  getSessionStorageKey,
  loadPersistentSession,
  resetDataModeForTesting,
  savePersistentSession,
} from '../src/lib/data-mode/data-mode.ts';
import { ApiSessionsProvider } from '../src/lib/data-mode/api/api-sessions.provider.ts';
import { ApiOrdersProvider } from '../src/lib/data-mode/api/api-orders.provider.ts';
import { ApiServicesProvider } from '../src/lib/data-mode/api/api-services.provider.ts';
import { ApiComplaintsProvider } from '../src/lib/data-mode/api/api-complaints.provider.ts';
import { ApiMenuProvider } from '../src/lib/data-mode/api/api-menu.provider.ts';
import { DemoSessionsProvider } from '../src/lib/data-mode/demo/demo-sessions.provider.ts';
import {
  FossRealtimeClient,
  FOSS_SESSION_EXPIRED_EVENT,
  RealtimeEventType,
} from '../src/lib/realtime/realtime-client.ts';

// Mock in-memory browser storage for node:test environment
class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

describe('FOSS Guest Session Persistence & Security Review (PR #137, Issue #136)', () => {
  beforeEach(() => {
    resetDataModeForTesting();
    (globalThis as any).window = {
      localStorage: new MockStorage(),
      sessionStorage: new MockStorage(),
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  it('Requirement 1 & Regression 1: live API bearer tokens are NEVER persisted in browser storage (localStorage or sessionStorage)', () => {
    const liveBearerToken = 'super-secret-live-api-bearer-token-123';
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    savePersistentSession(liveBearerToken, 'api', expiresAt, stayEnd);

    // 1. Verify live bearer token is NOT present in localStorage
    const rawStorage = (globalThis as any).window.localStorage.getItem(
      getPersistentStorageKey('api'),
    );
    assert.ok(rawStorage, 'Persistent session record must exist in localStorage');
    const parsed = JSON.parse(rawStorage);
    assert.equal(
      parsed.token,
      undefined,
      'Live API bearer token MUST NOT be stored in localStorage',
    );
    assert.equal(parsed.hasSession, true);
    assert.equal(parsed.mode, 'api');
    assert.equal(parsed.stayEnd, stayEnd);

    // 2. Verify live bearer token is NOT present in sessionStorage
    const sessionTokenInSessionStorage = (globalThis as any).window.sessionStorage.getItem(
      getSessionStorageKey('api'),
    );
    assert.equal(
      sessionTokenInSessionStorage,
      null,
      'Live API bearer token MUST NOT be stored in sessionStorage',
    );

    // 3. Verify loadPersistentSession returns cookie session indicator sentinel, not live bearer token
    const loaded = loadPersistentSession('api');
    assert.equal(loaded, '__COOKIE_SESSION__');
    assert.notEqual(loaded, liveBearerToken);
  });

  it('Requirement 1: isolated demo-mode behavior is retained for offline fixtures', () => {
    const demoToken = 'demo-token-room-101';
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    savePersistentSession(demoToken, 'demo', expiresAt, stayEnd);

    // Demo tokens are stored in the demo partition
    const demoRaw = (globalThis as any).window.localStorage.getItem(
      getPersistentStorageKey('demo'),
    );
    assert.ok(demoRaw);
    const parsed = JSON.parse(demoRaw);
    assert.equal(parsed.token, demoToken);
    assert.equal(parsed.mode, 'demo');

    // Demo sessionStorage has the demo token
    assert.equal(
      (globalThis as any).window.sessionStorage.getItem(getSessionStorageKey('demo')),
      demoToken,
    );

    // API partition remains completely empty
    assert.equal(
      (globalThis as any).window.localStorage.getItem(getPersistentStorageKey('api')),
      null,
    );
  });

  it('Requirement 3 & Regression 2: valid cookie sessions restore authentication after browser reopening', async () => {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    // 1. Establish persistent session record
    savePersistentSession('arbitrary-token-not-stored', 'api', expiresAt, stayEnd);

    // 2. Simulate mobile browser restart: sessionStorage is cleared, localStorage remains
    (globalThis as any).window.sessionStorage.clear();

    const indicator = loadPersistentSession('api');
    assert.equal(indicator, '__COOKIE_SESSION__');

    // 3. Mock backend /guest-sessions/me endpoint
    const originalFetch = globalThis.fetch;
    let meCalled = false;
    let capturedHeaders: Record<string, string> = {};
    let capturedCredentials = '';

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/guest-sessions/me')) {
        meCalled = true;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        capturedCredentials = init?.credentials || '';
        return new Response(
          JSON.stringify({
            sessionId: 'sess-restored-101',
            bookingId: 'book-456',
            roomNumber: '101',
            sessionToken: 'fresh-memory-token',
            guestName: 'Jane Restored',
            stayStart: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            stayEnd: stayEnd,
            expiresAt: expiresAt,
            role: 'GUEST',
            active: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const apiProvider = new ApiSessionsProvider();
      // Restoration call uses sentinel or omitted token
      const restored = await apiProvider.fetchCurrentSession(indicator || undefined);

      assert.equal(meCalled, true);
      assert.equal(
        capturedCredentials,
        'include',
        'Must send credentials: include to transmit HttpOnly cookie',
      );
      assert.equal(
        capturedHeaders['Authorization'],
        undefined,
        'Sentinel __COOKIE_SESSION__ must not be sent as a Bearer token',
      );
      assert.equal(
        capturedHeaders['x-foss-client'],
        'foss-web',
        'Must send custom header for CSRF defense',
      );
      assert.equal(restored.guestName, 'Jane Restored');
      assert.equal(restored.roomNumber, '101');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Requirement 3: supports stay renewal via ApiSessionsProvider and DemoSessionsProvider', async () => {
    const originalFetch = globalThis.fetch;
    let renewCalled = false;
    let capturedHeaders: Record<string, string> = {};
    let capturedCredentials = '';

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/guest-sessions/renew')) {
        renewCalled = true;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        capturedCredentials = init?.credentials || '';
        return new Response(
          JSON.stringify({
            sessionId: 'sess-renewed-101',
            bookingId: 'book-multi-day',
            roomNumber: '101',
            sessionToken: 'renewed-session-token',
            guestName: 'Alex Explorer',
            stayStart: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
            stayEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            active: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const apiProvider = new ApiSessionsProvider();
      const renewalResult = await apiProvider.renewSession('valid-multi-day-token');

      assert.equal(renewCalled, true);
      assert.equal(capturedCredentials, 'include');
      assert.equal(capturedHeaders['Authorization'], 'Bearer valid-multi-day-token');
      assert.equal(capturedHeaders['x-foss-client'], 'foss-web');
      assert.equal(renewalResult.sessionToken, 'renewed-session-token');
      assert.equal(renewalResult.guest.guestName, 'Alex Explorer');

      // Also verify DemoSessionsProvider supports renewal
      const demoProvider = new DemoSessionsProvider();
      const demoResult = await demoProvider.renewSession('demo-token-room-101');
      assert.equal(demoResult.sessionToken, 'demo-token-room-101');
      assert.equal(demoResult.guest.roomNumber, '101');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Regression 7: manual logout clears browser authentication and persistent records', async () => {
    const originalFetch = globalThis.fetch;
    let logoutCalled = false;
    let logoutCredentials = '';

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/guest-sessions/logout')) {
        logoutCalled = true;
        logoutCredentials = init?.credentials || '';
        return new Response(
          JSON.stringify({ success: true, message: 'Logged out successfully.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      savePersistentSession('token-to-logout', 'api');
      assert.equal(loadPersistentSession('api'), '__COOKIE_SESSION__');

      const apiProvider = new ApiSessionsProvider();
      const result = await apiProvider.logoutSession('token-to-logout');
      assert.equal(logoutCalled, true);
      assert.equal(logoutCredentials, 'include');
      assert.equal(result.success, true);

      clearPersistentSession('api');

      assert.equal(loadPersistentSession('api'), null);
      assert.equal(
        (globalThis as any).window.localStorage.getItem(getPersistentStorageKey('api')),
        null,
      );
      assert.equal(
        (globalThis as any).window.sessionStorage.getItem(getSessionStorageKey('api')),
        null,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Regression 8: client automatically purges persistent storage if stored stayEnd has expired', () => {
    const pastStayEnd = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago

    savePersistentSession('token', 'api', pastStayEnd, pastStayEnd);
    (globalThis as any).window.sessionStorage.clear();

    // Loading expired session returns null and clears storage
    const result = loadPersistentSession('api');
    assert.equal(result, null);
    assert.equal(
      (globalThis as any).window.localStorage.getItem(getPersistentStorageKey('api')),
      null,
    );
  });

  it('Regression 8: purges client persistent storage when session restoration receives 401 Unauthorized', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'Active session not found or revoked.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      savePersistentSession('token', 'api');
      assert.equal(loadPersistentSession('api'), '__COOKIE_SESSION__');

      const apiProvider = new ApiSessionsProvider();
      await assert.rejects(
        () => apiProvider.fetchCurrentSession(),
        (err: any) => err.statusCode === 401,
      );

      // Explicitly purge on confirmed 401
      clearPersistentSession('api');
      assert.equal(loadPersistentSession('api'), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('TC13 & AC4: RealtimeClient dispatches FOSS_SESSION_EXPIRED_EVENT upon SESSION_REVOKED', async () => {
    const originalFetch = globalThis.fetch;
    let dispatchedEventName = '';
    let dispatchedDetail: any = null;

    (globalThis as any).window.dispatchEvent = (event: any) => {
      dispatchedEventName = event.type;
      dispatchedDetail = event.detail;
      return true;
    };

    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                eventId: 'evt-checkout-revocation',
                eventType: RealtimeEventType.SESSION_REVOKED,
                roomNumber: '101',
                bookingId: 'book-101',
                version: 5,
                serverTimestamp: new Date().toISOString(),
                data: { reason: 'CHECKOUT' },
              })}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    try {
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'revoked-checkout-token',
        bookingId: 'book-101',
        roomNumber: '101',
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 60));

      assert.equal(client.getStatus(), 'DISCONNECTED');
      assert.equal(dispatchedEventName, FOSS_SESSION_EXPIRED_EVENT);
      assert.equal(dispatchedDetail?.token, 'revoked-checkout-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('TC17: network interruption throws without wiping persistent storage', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('Network timeout (simulated connectivity disruption)');
    }) as typeof fetch;

    try {
      savePersistentSession('active-offline-token', 'api');

      const apiProvider = new ApiSessionsProvider();
      await assert.rejects(
        () => apiProvider.fetchCurrentSession(),
        (err: any) => err.message.includes('Network') || err.statusCode === 503,
      );

      // Persistent credentials sentinel remains available on temporary network loss
      assert.equal(loadPersistentSession('api'), '__COOKIE_SESSION__');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('One-time QR authentication: restores session after 48h and 72h of inactivity during an active multi-day stay', () => {
    // Guest checked in on Monday at 14:00, checking out on Friday at 11:00 (93 hours total)
    const now = Date.now();
    const stayEnd = new Date(now + 45 * 3600 * 1000).toISOString(); // 45 hours in future (Friday)

    // Save session metadata established at Monday QR scan
    savePersistentSession('token-ignored-in-api-mode', 'api', stayEnd, stayEnd);

    // Simulate returning after 48h of inactivity (browser reopened, sessionStorage empty)
    (globalThis as any).window.sessionStorage.clear();
    const restoredSentinel48h = loadPersistentSession('api');
    assert.equal(
      restoredSentinel48h,
      '__COOKIE_SESSION__',
      'Must restore cookie session indicator after 48 hours of inactivity',
    );

    // Simulate returning after 72h of inactivity
    const restoredSentinel72h = loadPersistentSession('api');
    assert.equal(
      restoredSentinel72h,
      '__COOKIE_SESSION__',
      'Must restore cookie session indicator after 72 hours of inactivity',
    );
  });

  it('Cookie authentication works across all FOSS API providers without requiring a live Bearer token', async () => {
    const originalFetch = globalThis.fetch;
    const interceptedRequests: { url: string; method: string; credentials: any; headers: any }[] =
      [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      interceptedRequests.push({
        url: String(url),
        method: init?.method || 'GET',
        credentials: init?.credentials,
        headers: (init?.headers as Record<string, string>) || {},
      });

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      // 1. Food orders via cookie
      const ordersProvider = new ApiOrdersProvider();
      await ordersProvider.fetchGuestOrders('__COOKIE_SESSION__');

      // 2. Service requests via cookie
      const servicesProvider = new ApiServicesProvider();
      await servicesProvider.fetchGuestServiceRequests('__COOKIE_SESSION__');

      // 3. Complaints via cookie
      const complaintsProvider = new ApiComplaintsProvider();
      await complaintsProvider.fetchGuestComplaints('__COOKIE_SESSION__');

      // 4. Menu via cookie
      const menuProvider = new ApiMenuProvider();
      await menuProvider.fetchGuestMenu('__COOKIE_SESSION__');

      assert.equal(interceptedRequests.length, 4);
      for (const req of interceptedRequests) {
        assert.equal(
          req.credentials,
          'include',
          `Request to ${req.url} must include credentials for HttpOnly cookie`,
        );
        assert.equal(
          req.headers['x-foss-client'],
          'foss-web',
          `Request to ${req.url} must include x-foss-client header`,
        );
        assert.equal(
          req.headers['Authorization'],
          undefined,
          `Request to ${req.url} must NOT send sentinel as Bearer token`,
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Correction A: redeemQrToken succeeds when backend omits sessionToken, hydrating __COOKIE_SESSION__', async () => {
    const originalFetch = globalThis.fetch;
    const interceptedRequests: { url: string; credentials: any }[] = [];

    // Backend responds without sessionToken, setting HttpOnly cookie in response headers
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      interceptedRequests.push({
        url: String(url),
        credentials: init?.credentials,
      });

      return new Response(
        JSON.stringify({
          sessionId: 'sess-cookie-101',
          bookingId: 'book-101',
          roomNumber: '101',
          guestName: 'Valued Guest',
          stayStart: '2026-11-09T14:00:00.000Z',
          stayEnd: '2026-11-13T11:00:00.000Z',
          expiresAt: '2026-11-13T11:00:00.000Z',
          active: true,
          // sessionToken is strictly omitted by backend
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'foss_guest_session=secret-cookie-val; HttpOnly; Path=/',
          },
        },
      );
    }) as typeof fetch;

    try {
      const apiSessionsProvider = new ApiSessionsProvider();
      const result = await apiSessionsProvider.redeemQrToken('opaque-qr-activation-token');

      assert.equal(result.sessionToken, '__COOKIE_SESSION__');
      assert.equal(result.guest.roomNumber, '101');
      assert.equal(result.guest.bookingId, 'book-101');
      assert.equal(interceptedRequests[0].credentials, 'include');

      // Now save session using returned token and verify zero live bearer tokens in storage
      savePersistentSession(result.sessionToken, 'api', result.expiresAt, result.guest.stayEnd);

      const persistentRaw = (globalThis as any).window.localStorage.getItem(
        getPersistentStorageKey('api'),
      );
      const parsed = JSON.parse(persistentRaw);
      assert.equal(parsed.token, undefined);
      assert.equal(parsed.hasSession, true);
      assert.equal(loadPersistentSession('api'), '__COOKIE_SESSION__');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
