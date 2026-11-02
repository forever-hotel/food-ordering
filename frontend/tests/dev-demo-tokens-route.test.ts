import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';

import { GET } from '../src/app/api/dev/demo-tokens/route.ts';
import { ApiSessionsProvider } from '../src/lib/data-mode/api/api-sessions.provider.ts';

describe('Server-Side Development Proxy & Demo Token Authorization Tests (#101)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.DEMO_MODE = 'true';
    process.env.DEV_DEMO_KEY = 'test-dev-secret-key';
    process.env.INTERNAL_API_URL = 'http://backend:4300';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('Next.js route handler /api/dev/demo-tokens', () => {
    it('1. Rejects with 404 when in production mode without demo mode opt-in', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DEMO_MODE = 'false';

      const req = new NextRequest('http://localhost:3000/api/dev/demo-tokens', {
        headers: { host: 'localhost:3000' },
      });

      const res = await GET(req);
      assert.equal(res.status, 404);
    });

    it('2. Rejects with 403 when untrusted forwarded headers are present', async () => {
      const forwardedHeaders: Record<string, string>[] = [
        { 'x-forwarded-for': '203.0.113.195' },
        { 'x-forwarded-host': 'public-hotel.com' },
        { 'x-forwarded-proto': 'https' },
      ];

      for (const headers of forwardedHeaders) {
        const req = new NextRequest('http://localhost:3000/api/dev/demo-tokens', {
          headers: { host: 'localhost:3000', ...headers },
        });

        const res = await GET(req);
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.error.includes('Forwarded requests are strictly rejected'));
      }
    });

    it('3. Rejects cross-origin requests with 403 when sec-fetch-site is cross-site', async () => {
      const req = new NextRequest('http://localhost:3000/api/dev/demo-tokens', {
        headers: {
          host: 'localhost:3000',
          'sec-fetch-site': 'cross-site',
        },
      });

      const res = await GET(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Cross-origin'));
    });

    it('4. Rejects non-localhost host headers with 403', async () => {
      const untrustedHosts = ['evil-attacker.com', '192.168.1.50:3000', '10.0.0.1:3000'];

      for (const host of untrustedHosts) {
        const req = new NextRequest(`http://${host}/api/dev/demo-tokens`, {
          headers: { host },
        });

        const res = await GET(req);
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.error.includes('restricted to local hosts'));
      }
    });

    it('5. Rejects with 403 when server DEV_DEMO_KEY is not configured', async () => {
      delete process.env.DEV_DEMO_KEY;

      const req = new NextRequest('http://localhost:3000/api/dev/demo-tokens', {
        headers: {
          host: 'localhost:3000',
          'sec-fetch-site': 'same-origin',
        },
      });

      const res = await GET(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('not configured'));
    });

    it('6. Proxies to backend with server-only x-developer-key on valid same-origin localhost request', async () => {
      let forwardedKey = '';
      let requestedUrl = '';

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = url.toString();
        const headers = (init?.headers || {}) as Record<string, string>;
        forwardedKey = headers['x-developer-key'] || '';

        return new Response(
          JSON.stringify({
            tokens: {
              '101': 'mock-qr-token-101',
              'Room 101 (John Doe)': 'mock-qr-token-101',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const req = new NextRequest('http://localhost:3000/api/dev/demo-tokens', {
        headers: {
          host: 'localhost:3000',
          'sec-fetch-site': 'same-origin',
        },
      });

      const res = await GET(req);
      assert.equal(res.status, 200);
      assert.equal(requestedUrl, 'http://backend:4300/guest-sessions/demo-tokens');
      assert.equal(forwardedKey, 'test-dev-secret-key');

      const data = await res.json();
      assert.equal(data.tokens['101'], 'mock-qr-token-101');
    });
  });

  describe('ApiSessionsProvider.fetchDemoTokens', () => {
    it('7. Fetches from same-origin /api/dev/demo-tokens when window is available (browser context)', async () => {
      // Mock browser window object
      (globalThis as unknown as { window: unknown }).window = {};

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr === '/api/dev/demo-tokens') {
          return new Response(
            JSON.stringify({
              tokens: {
                'Room 101 (John Doe)': 'browser-dev-token-101',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new ApiSessionsProvider();
      const tokens = await provider.fetchDemoTokens();
      assert.equal(tokens['Room 101 (John Doe)'], 'browser-dev-token-101');

      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it('8. Falls back to direct backend URL when /api/dev/demo-tokens is unavailable', async () => {
      (globalThis as unknown as { window: unknown }).window = {};

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr === '/api/dev/demo-tokens') {
          return new Response('Forbidden', { status: 403 });
        }
        if (urlStr.includes('/guest-sessions/demo-tokens')) {
          return new Response(
            JSON.stringify({
              tokens: {
                '102': 'direct-loopback-token-102',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new ApiSessionsProvider();
      const tokens = await provider.fetchDemoTokens();
      assert.equal(tokens['102'], 'direct-loopback-token-102');

      delete (globalThis as unknown as { window?: unknown }).window;
    });
  });
});
