import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ApiSessionsProvider } from '../src/lib/data-mode/api/api-sessions.provider.ts';
import { DemoSessionsProvider } from '../src/lib/data-mode/demo/demo-sessions.provider.ts';

describe('Production-Ready Guest Authentication & Removal of DEV_DEMO_KEY (#101)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEV_DEMO_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('1. Retirement of HTTP Demo-Token Retrieval & Dev Proxy', () => {
    it('confirms server-side development proxy route /api/dev/demo-tokens is deleted', () => {
      const proxyRoutePath = path.resolve(process.cwd(), 'src/app/api/dev/demo-tokens/route.ts');
      assert.equal(
        fs.existsSync(proxyRoutePath),
        false,
        'Server proxy route /api/dev/demo-tokens/route.ts must be completely removed.',
      );
    });

    it('ApiSessionsProvider.fetchDemoTokens() returns empty {} without making HTTP calls', async () => {
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response('Should not be called', { status: 500 });
      }) as unknown as typeof fetch;

      const provider = new ApiSessionsProvider();
      const tokens = await provider.fetchDemoTokens();

      assert.deepEqual(tokens, {});
      assert.equal(fetchCalled, false, 'fetchDemoTokens must not make any HTTP calls in API mode.');
    });

    it('ApiSessionsProvider.resetDemo() does not call backend demo-reset HTTP route', async () => {
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response('Should not be called', { status: 500 });
      }) as unknown as typeof fetch;

      const provider = new ApiSessionsProvider();
      const result = await provider.resetDemo();

      assert.equal(result.success, true);
      assert.equal(fetchCalled, false, 'resetDemo must not call backend demo-reset HTTP route.');
    });
  });

  describe('2. Absence of DEV_DEMO_KEY in Frontend Configuration & Bundles', () => {
    it('verifies DEV_DEMO_KEY is not defined in frontend source or public environment', () => {
      assert.equal(process.env.DEV_DEMO_KEY, undefined);
      assert.equal(process.env.NEXT_PUBLIC_DEV_DEMO_KEY, undefined);
    });

    it('verifies ApiSessionsProvider does not transmit x-developer-key or x-demo-admin-key headers', async () => {
      const recordedHeaders: Record<string, string>[] = [];

      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        recordedHeaders.push((init?.headers || {}) as Record<string, string>);
        return new Response(
          JSON.stringify({
            sessionToken: 'test-session-jwt',
            expiresAt: '2026-11-04T12:00:00.000Z',
            sessionId: 'sess-101',
            roomNumber: '101',
            bookingId: 'b-101',
            guestName: 'John Doe',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const provider = new ApiSessionsProvider();
      await provider.redeemQrToken('legitimate-fds-qr-token-uuid-12345');

      assert.ok(recordedHeaders.length > 0);
      for (const headers of recordedHeaders) {
        assert.equal(headers['x-developer-key'], undefined);
        assert.equal(headers['x-demo-admin-key'], undefined);
      }
    });
  });

  describe('3. Isolated Frontend Mock Mode Boundary & Demo Room Handling', () => {
    it('DemoSessionsProvider resolves demo tokens and stays strictly in-memory', async () => {
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response('Must not be contacted', { status: 500 });
      }) as unknown as typeof fetch;

      const demoProvider = new DemoSessionsProvider();
      const demoTokens = await demoProvider.fetchDemoTokens();

      assert.ok(Object.keys(demoTokens).length > 0);
      assert.equal(fetchCalled, false, 'Mock mode must never issue live network requests.');

      // Redeem mock stay
      const room101Token = demoTokens['Room 101 (John Doe)'];
      assert.ok(room101Token);

      const session = await demoProvider.redeemQrToken(room101Token);
      assert.equal(session.guest.roomNumber, '101');
      assert.equal(session.guest.guestName, 'John Doe');
      assert.equal(fetchCalled, false, 'Mock redemption must remain strictly in-memory.');
    });

    it('ApiSessionsProvider rejects demonstration QR tokens against live backend', async () => {
      const provider = new ApiSessionsProvider();

      await assert.rejects(
        async () => {
          await provider.redeemQrToken('act-demo-101');
        },
        {
          name: 'ApiError',
          message: 'Demonstration QR tokens cannot be redeemed against the real API.',
        },
      );
    });

    it('ApiSessionsProvider rejects demonstration session tokens against live backend', async () => {
      const provider = new ApiSessionsProvider();

      await assert.rejects(
        async () => {
          await provider.fetchCurrentSession('demo-token-101');
        },
        {
          name: 'ApiError',
          message: 'Demonstration session tokens cannot be transmitted to real API endpoints.',
        },
      );
    });

    it('ApiSessionsProvider rejects empty or whitespace QR activation code with 400', async () => {
      const provider = new ApiSessionsProvider();

      await assert.rejects(
        async () => {
          await provider.redeemQrToken('   ');
        },
        {
          name: 'ApiError',
          status: 400,
          message: 'QR activation code is required.',
        },
      );
    });
  });
});
