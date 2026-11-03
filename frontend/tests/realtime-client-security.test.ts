import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  disconnectAllRealtimeClients,
  FossRealtimeClient,
  FossRealtimeEvent,
  RealtimeEventType,
} from '../src/lib/realtime/realtime-client.ts';

describe('Realtime Client Security & Fetch-Based SSE Authentication (CIT-04)', () => {
  it('connects to SSE stream via fetch with Authorization header and NO token in URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      // Return a mock readable stream that stays open
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

      // Allow microtask ticks for fetch and stream reading
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

  it('filters out events belonging to other rooms (strict room isolation)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Event for foreign room 102
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
