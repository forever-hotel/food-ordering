import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  disconnectAllRealtimeClients,
  FossRealtimeClient,
  type FossRealtimeEvent,
  RealtimeEventType,
} from '../src/lib/realtime/realtime-client.ts';

describe('Realtime Client Security & Fetch-Based SSE Authentication (CIT-04 Phase B)', () => {
  it('stops retries when the authenticated stream returns 401', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('Session revoked', { status: 401 });
    }) as typeof fetch;
    const client = new FossRealtimeClient({
      apiUrl: 'http://localhost:4300',
      sessionToken: 'expired',
      bookingId: 'booking',
      roomNumber: '101',
      initialBackoffMs: 1,
    });
    try {
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(client.getStatus(), 'DISCONNECTED');
      assert.equal(calls, 1);
    } finally {
      client.disconnect();
      globalThis.fetch = originalFetch;
    }
  });
  it('refreshes owner snapshots even when the fallback event buffer is empty', async () => {
    const originalFetch = globalThis.fetch;
    let refreshes = 0;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ events: [] }), { status: 200 })) as typeof fetch;
    const client = new FossRealtimeClient({
      apiUrl: 'http://localhost:4300',
      sessionToken: 'guest',
      bookingId: 'booking',
      roomNumber: '101',
      onRefresh: () => {
        refreshes++;
      },
    });
    try {
      // Model a connected socket recovering missed invalidations.
      Object.assign(client, { status: 'CONNECTED' });
      await client.pollOnce();
      assert.equal(refreshes, 1);
    } finally {
      client.disconnect();
      globalThis.fetch = originalFetch;
    }
  });
  it('connects to SSE stream via fetch with Authorization header and NO token in URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                eventId: 'evt-sec-001',
                eventType: RealtimeEventType.HEARTBEAT,
                roomNumber: '101',
                bookingId: 'book-101',
                version: 1,
                serverTimestamp: new Date().toISOString(),
                data: {},
              })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }) as typeof fetch;

    try {
      const receivedEvents: FossRealtimeEvent[] = [];
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'secret-bearer-token-12345',
        bookingId: 'book-101',
        roomNumber: '101',
        onEvent: (e) => receivedEvents.push(e),
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 1. Verify URL contains NO credentials or query params
      assert.equal(capturedUrl, 'http://localhost:4300/realtime/events/stream');
      assert.equal(
        capturedUrl.includes('token='),
        false,
        'Token must NEVER be in URL query string',
      );
      assert.equal(
        capturedUrl.includes('secret-bearer-token'),
        false,
        'Secret token leaked in URL',
      );

      // 2. Verify Authorization header is correctly sent
      assert.equal(capturedHeaders['Authorization'], 'Bearer secret-bearer-token-12345');
      assert.equal(capturedHeaders['Accept'], 'text/event-stream');

      // 3. Verify event was received
      assert.equal(receivedEvents.length, 1);
      assert.equal(receivedEvents[0].eventId, 'evt-sec-001');

      client.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('correctly reassembles fragmented SSE chunks across stream packets', async () => {
    const originalFetch = globalThis.fetch;
    const fullEventJson = JSON.stringify({
      eventId: 'evt-frag-001',
      eventType: RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      roomNumber: '101',
      bookingId: 'book-101',
      version: 2,
      serverTimestamp: new Date().toISOString(),
      data: { status: 'PREPARING' },
    });

    const part1 = `data: ${fullEventJson.slice(0, 30)}`;
    const part2 = `${fullEventJson.slice(30)}\n\n`;

    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(part1));
          await new Promise((r) => setTimeout(r, 20));
          controller.enqueue(encoder.encode(part2));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    try {
      const receivedEvents: FossRealtimeEvent[] = [];
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-frag',
        bookingId: 'book-101',
        roomNumber: '101',
        onEvent: (e) => receivedEvents.push(e),
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 80));

      assert.equal(receivedEvents.length, 1);
      assert.equal(receivedEvents[0].eventId, 'evt-frag-001');
      assert.equal((receivedEvents[0].data as { status: string }).status, 'PREPARING');

      client.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('filters out events belonging to other rooms (strict room isolation)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                eventId: 'evt-foreign-102',
                eventType: RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
                roomNumber: '102',
                bookingId: 'book-102',
                version: 1,
                serverTimestamp: new Date().toISOString(),
                data: { orderId: 'ord-102' },
              })}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    try {
      const receivedEvents: FossRealtimeEvent[] = [];
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-101',
        bookingId: 'book-101',
        roomNumber: '101',
        onEvent: (e) => receivedEvents.push(e),
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedEvents.length, 0, 'Foreign room event must be discarded');
      client.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('disconnects immediately upon receiving SESSION_REVOKED event', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                eventId: 'evt-revoked',
                eventType: RealtimeEventType.SESSION_REVOKED,
                roomNumber: '101',
                bookingId: 'book-101',
                version: 2,
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
      let latestStatus = '';
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-101',
        bookingId: 'book-101',
        roomNumber: '101',
        onStatusChange: (status) => {
          latestStatus = status;
        },
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(latestStatus, 'DISCONNECTED');
      assert.equal(client.getStatus(), 'DISCONNECTED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deduplicates identical event IDs', async () => {
    const originalFetch = globalThis.fetch;
    const eventPayload = {
      eventId: 'evt-duplicate-id',
      eventType: RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      roomNumber: '101',
      bookingId: 'book-101',
      version: 1,
      serverTimestamp: new Date().toISOString(),
      data: { status: 'DELIVERED' },
    };

    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventPayload)}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventPayload)}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    try {
      const receivedEvents: FossRealtimeEvent[] = [];
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-dedup',
        bookingId: 'book-101',
        roomNumber: '101',
        onEvent: (e) => receivedEvents.push(e),
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedEvents.length, 1, 'Duplicate event must be discarded');
      client.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to polling when SSE stream returns HTTP error', async () => {
    const originalFetch = globalThis.fetch;
    let pollInvoked = false;

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/realtime/events/stream')) {
        return new Response('Gateway SSE unavailable', { status: 503 });
      }
      if (urlStr.includes('/realtime/events/poll')) {
        pollInvoked = true;
        return new Response(
          JSON.stringify({
            events: [],
            serverTimestamp: new Date().toISOString(),
            latestVersion: 1,
            recommendedPollIntervalMs: 5000,
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      let finalStatus = '';
      const client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-poll',
        bookingId: 'book-101',
        roomNumber: '101',
        maxReconnectAttempts: 1,
        initialBackoffMs: 10,
        onStatusChange: (s) => {
          finalStatus = s;
        },
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 80));

      assert.equal(finalStatus, 'FALLBACK_POLLING');
      assert.equal(pollInvoked, true, 'Fallback polling must be triggered');

      client.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('disconnectAllRealtimeClients cleanly aborts all active sessions on logout', () => {
    const clientA = new FossRealtimeClient({
      apiUrl: 'http://localhost:4300',
      sessionToken: 'tok-a',
      bookingId: 'b-a',
      roomNumber: '101',
    });
    const clientB = new FossRealtimeClient({
      apiUrl: 'http://localhost:4300',
      sessionToken: 'tok-b',
      bookingId: 'b-b',
      roomNumber: '102',
    });

    clientA.connect();
    clientB.connect();

    disconnectAllRealtimeClients();

    assert.equal(clientA.getStatus(), 'DISCONNECTED');
    assert.equal(clientB.getStatus(), 'DISCONNECTED');
  });
});
