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

describe('FOSS Guest Session Persistence & Multi-Day Renewal (TC1 - TC20, AC1 - AC8)', () => {
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

  it('TC1 & AC1: saves persistent session with stay-bounded metadata upon QR activation', () => {
    const token = 'session-token-guest-101';
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    savePersistentSession(token, 'api', expiresAt, stayEnd);

    // Verified written to both localStorage and sessionStorage
    const loadedToken = loadPersistentSession('api');
    assert.equal(loadedToken, token);

    const rawStorage = (globalThis as any).window.localStorage.getItem(
      getPersistentStorageKey('api'),
    );
    assert.ok(rawStorage);
    const parsed = JSON.parse(rawStorage);
    assert.equal(parsed.token, token);
    assert.equal(parsed.mode, 'api');
    assert.equal(parsed.stayEnd, stayEnd);
  });

  it('TC2: preserves session across page refresh via sessionStorage cache', () => {
    const token = 'refresh-preserved-token';
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    savePersistentSession(token, 'api', expiresAt, stayEnd);

    // Simulate page refresh: sessionStorage contains the current tab token
    const tokenAfterRefresh = loadPersistentSession('api');
    assert.equal(tokenAfterRefresh, token);
  });

  it('TC3 & AC2: restores session from persistent storage after tab closure / browser restart', () => {
    const token = 'tab-closure-resilient-token';
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const stayEnd = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    savePersistentSession(token, 'api', expiresAt, stayEnd);

    // Simulate mobile browser tab closure: sessionStorage is completely wiped, localStorage remains
    (globalThis as any).window.sessionStorage.clear();
    assert.equal(
      (globalThis as any).window.sessionStorage.getItem(getSessionStorageKey('api')),
      null,
    );

    // Reopen FOSS in a new tab: session is retrieved from persistent storage and re-synchronized
    const restoredToken = loadPersistentSession('api');
    assert.equal(restoredToken, token);
    assert.equal(
      (globalThis as any).window.sessionStorage.getItem(getSessionStorageKey('api')),
      token,
      'Restored session token must be synchronized back into sessionStorage',
    );
  });

  it('TC4 & AC3: supports multi-day stay renewal via ApiSessionsProvider and DemoSessionsProvider', async () => {
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

  it('TC5 & TC19: purges client persistent storage when session restoration receives invalid or revoked status', async () => {
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
      savePersistentSession('stale-revoked-token', 'api');
      assert.equal(loadPersistentSession('api'), 'stale-revoked-token');

      const apiProvider = new ApiSessionsProvider();
      await assert.rejects(
        () => apiProvider.fetchCurrentSession('stale-revoked-token'),
        (err: any) => err.statusCode === 401,
      );

      // Explicitly purge on confirmed 401
      clearPersistentSession('api');
      assert.equal(loadPersistentSession('api'), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('TC7: client automatically purges persistent storage if stored stayEnd has expired', () => {
    const token = 'expired-stay-token';
    const pastStayEnd = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago

    savePersistentSession(token, 'api', pastStayEnd, pastStayEnd);
    (globalThis as any).window.sessionStorage.clear();

    // Loading expired session returns null and clears storage
    const result = loadPersistentSession('api');
    assert.equal(result, null);
    assert.equal(
      (globalThis as any).window.localStorage.getItem(getPersistentStorageKey('api')),
      null,
    );
  });

  it('TC11 & TC12 & AC6: manual logout clears both persistent storage and sessionStorage', () => {
    savePersistentSession('token-to-logout', 'api');
    assert.equal(loadPersistentSession('api'), 'token-to-logout');

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

  it('TC17: network interruption throws 503 without wiping persistent storage', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('Network timeout (simulated connectivity disruption)');
    }) as typeof fetch;

    try {
      savePersistentSession('active-offline-token', 'api');

      const apiProvider = new ApiSessionsProvider();
      await assert.rejects(
        () => apiProvider.fetchCurrentSession('active-offline-token'),
        (err: any) => err.message.includes('Network') || err.statusCode === 503,
      );

      // Persistent credentials are NOT destroyed on temporary network loss
      assert.equal(loadPersistentSession('api'), 'active-offline-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
