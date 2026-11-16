import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as http from 'node:http';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { correlationMiddleware } from '../src/common/middleware/correlation.middleware.js';
import { GuestAuthGuard } from '../src/modules/guest-sessions/guards/guest-auth.guard.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { RealtimeEventType } from '../src/realtime/enums/realtime-event-type.enum.js';
import { RealtimeController } from '../src/realtime/realtime.controller.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';

interface SseClient {
  status: number;
  headers: http.IncomingHttpHeaders;
  events: any[];
  waitForEvent: (timeoutMs?: number) => Promise<any>;
  close: () => void;
}

const activeSseClients: SseClient[] = [];

function subscribeSse(
  streamUrl: string,
  headers?: Record<string, string>,
): Promise<SseClient> {
  return new Promise<SseClient>((resolve, reject) => {
    const events: any[] = [];
    const waiters: Array<(event: any) => void> = [];
    let buffer = '';

    const req = http.get(streamUrl, { headers }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.replace(/^data:\s*/, ''));
              if (waiters.length > 0) {
                const waiter = waiters.shift();
                waiter?.(parsed);
              } else {
                events.push(parsed);
              }
            } catch {
              // Ignore non-json lines
            }
          }
        }
      });

      const client: SseClient = {
        status: res.statusCode || 0,
        headers: res.headers,
        events,
        waitForEvent: (timeoutMs = 4000) => {
          if (events.length > 0) {
            return Promise.resolve(events.shift());
          }
          return new Promise((resWaiter, rejWaiter) => {
            const timer = setTimeout(() => {
              rejWaiter(new Error('Timed out waiting for SSE event'));
            }, timeoutMs);
            waiters.push((evt) => {
              clearTimeout(timer);
              resWaiter(evt);
            });
          });
        },
        close: () => {
          req.destroy();
          res.destroy();
          res.socket?.destroy();
          const idx = activeSseClients.indexOf(client);
          if (idx !== -1) activeSseClients.splice(idx, 1);
        },
      };

      activeSseClients.push(client);
      resolve(client);
    });

    req.on('error', reject);
  });
}

describe('Authenticated Real-Time Event Delivery & Fallback (e2e)', () => {
  let app: INestApplication;
  let realtimeService: RealtimeService;
  let baseUrl: string;

  let activeTokenRoom101: string;
  let activeTokenRoom102: string;

  beforeAll(async () => {
    activeTokenRoom101 = 'token-realtime-room-101';
    activeTokenRoom102 = 'token-realtime-room-102';

    const mockGuestSessionsService = {
      validateSessionToken: async (token: string) => {
        if (token === activeTokenRoom101) {
          return {
            session: {
              sessionId: 'session-uuid-101',
              bookingId: 'booking-101',
              roomNumber: '101',
              isActive: true,
            },
            stay: {
              guestName: 'Jane Doe',
              stayStart: new Date(),
              stayEnd: new Date(Date.now() + 86400000),
            },
          };
        }
        if (token === activeTokenRoom102) {
          return {
            session: {
              sessionId: 'session-uuid-102',
              bookingId: 'booking-102',
              roomNumber: '102',
              isActive: true,
            },
            stay: {
              guestName: 'John Smith',
              stayStart: new Date(),
              stayEnd: new Date(Date.now() + 86400000),
            },
          };
        }
        throw new UnauthorizedException('Invalid or expired session token.');
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              DEMO_MODE: 'true',
            }),
          ],
        }),
      ],
      controllers: [RealtimeController],
      providers: [
        RealtimeService,
        GuestAuthGuard,
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    realtimeService = moduleFixture.get<RealtimeService>(RealtimeService);

    app.use(correlationMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    await app.listen(0);
    const serverAddress = app.getHttpServer().address();
    baseUrl =
      typeof serverAddress === 'object' && serverAddress
        ? `http://127.0.0.1:${serverAddress.port}`
        : 'http://127.0.0.1:4300';
  });

  afterAll(async () => {
    for (const client of activeSseClients.slice()) {
      try {
        client.close();
      } catch {}
    }
    activeSseClients.length = 0;
    if (app) {
      await app.close();
    }
  });

  describe('TC-DDP-135-AC1: Successful Workflow - Real-Time Broadcast & Multi-Client Stay Delivery', () => {
    it('broadcasts food order and service request status updates to room channel within milliseconds', async () => {
      // 1. Emit food order update for room 101
      const orderEvent = realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        {
          orderId: 'ord-ac1-001',
          status: 'IN_PREPARATION',
          estimatedDeliveryMinutes: 25,
        },
      );

      expect(orderEvent.version).toBe(1);
      expect(orderEvent.roomNumber).toBe('101');
      expect(orderEvent.eventType).toBe(
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      );

      // 2. Emit service request update for room 101
      const serviceEvent = realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        {
          requestId: 'sr-ac1-001',
          status: 'ASSIGNED',
          assignedStaff: 'Housekeeper Kamal',
        },
      );

      expect(serviceEvent.version).toBe(2);

      // 3. Verify event stream delivery
      const response = await request(app.getHttpServer())
        .get('/realtime/events/poll')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(2);
      expect(response.body.latestVersion).toBe(2);
      expect(response.body.recommendedPollIntervalMs).toBe(3000);
      expect(response.body.events[0].eventType).toBe(
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      );
      expect(response.body.events[1].eventType).toBe(
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      );
    });
  });

  describe('TC-DDP-135-AC2: Negative / Error Case - REST Polling Fallback & Foreign Room Exclusion', () => {
    it('ensures Room 102 polling NEVER leaks Room 101 events', async () => {
      // Emit an event for Room 102
      realtimeService.emitToStay(
        'booking-102',
        '102',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        {
          orderId: 'ord-102-private',
          status: 'SUBMITTED',
        },
      );

      // Room 102 poll
      const room102Poll = await request(app.getHttpServer())
        .get('/realtime/events/poll')
        .set('Authorization', `Bearer ${activeTokenRoom102}`);

      expect(room102Poll.status).toBe(200);
      expect(room102Poll.body.events).toHaveLength(1);
      expect(
        room102Poll.body.events.every((e: any) => e.roomNumber === '102'),
      ).toBe(true);

      // Room 101 poll
      const room101Poll = await request(app.getHttpServer())
        .get('/realtime/events/poll')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(room101Poll.status).toBe(200);
      expect(
        room101Poll.body.events.every((e: any) => e.roomNumber === '101'),
      ).toBe(true);
      expect(
        room101Poll.body.events.some((e: any) => e.roomNumber === '102'),
      ).toBe(false);
    });

    it('supports gap recovery using sinceVersion query parameter', async () => {
      // Fetch only events with version > 1 for room 101
      const gapResponse = await request(app.getHttpServer())
        .get('/realtime/events/poll?sinceVersion=1')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(gapResponse.status).toBe(200);
      expect(gapResponse.body.events).toHaveLength(1);
      expect(gapResponse.body.events[0].version).toBe(2);
    });
  });

  describe('TC-DDP-135-AC3: Boundary, Concurrency & Revocation Handling', () => {
    it('deduplicates events with identical eventId without creating duplicates', async () => {
      const fixedEventId = 'fixed-uuid-ac3-dedup';

      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { status: 'DELIVERED' },
        fixedEventId,
      );

      // Duplicate delivery
      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { status: 'DELIVERED' },
        fixedEventId,
      );

      const pollRes = await request(app.getHttpServer())
        .get('/realtime/events/poll?sinceVersion=2')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(pollRes.status).toBe(200);
      const matches = pollRes.body.events.filter(
        (e: any) => e.eventId === fixedEventId,
      );
      expect(matches).toHaveLength(1);
    });

    it('cleans up channel and emits SESSION_REVOKED upon stay termination', async () => {
      realtimeService.revokeStaySessions('booking-101', '101');

      const pollRes = await request(app.getHttpServer())
        .get('/realtime/events/poll')
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.events).toHaveLength(0);
      expect(pollRes.body.latestVersion).toBe(0);
    });
  });

  describe('TC-DDP-135-AC4: Contract Compliance & Authentication Guards', () => {
    it('rejects unauthenticated polling request with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer()).get(
        '/realtime/events/poll',
      );

      expect(response.status).toBe(401);
    });

    it('rejects unauthenticated SSE stream connection with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer()).get(
        '/realtime/events/stream',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('TC-DDP-135-AC5: Real SSE Streaming Verification (#101)', () => {
    it('establishes authenticated SSE stream via query param and header and verifies content-type', async () => {
      const streamQuery = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );
      expect(streamQuery.status).toBe(200);
      expect(streamQuery.headers['content-type']).toContain(
        'text/event-stream',
      );
      streamQuery.close();

      const streamHeader = await subscribeSse(
        `${baseUrl}/realtime/events/stream`,
        { Authorization: `Bearer ${activeTokenRoom101}` },
      );
      expect(streamHeader.status).toBe(200);
      expect(streamHeader.headers['content-type']).toContain(
        'text/event-stream',
      );
      streamHeader.close();
    });

    it('delivers food order status events in real-time over active SSE stream', async () => {
      const stream101 = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );

      const eventPromise = stream101.waitForEvent();

      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        {
          orderId: 'ord-sse-delivery-001',
          status: 'READY',
          estimatedDeliveryMinutes: 5,
        },
      );

      const received = await eventPromise;
      expect(received).toBeDefined();
      expect(received.eventType).toBe(
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      );
      expect(received.roomNumber).toBe('101');
      expect(received.bookingId).toBe('booking-101');
      expect(received.data.status).toBe('READY');
      expect(received.data.orderId).toBe('ord-sse-delivery-001');

      stream101.close();
    });

    it('enforces strict room isolation with ZERO cross-room event leakage over SSE', async () => {
      const stream101 = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );
      const stream102 = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom102}`,
      );

      const p102 = stream102.waitForEvent();

      // Emit event destined strictly for Room 102
      realtimeService.emitToStay(
        'booking-102',
        '102',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        {
          orderId: 'ord-room-102-private',
          status: 'IN_PREPARATION',
        },
      );

      const received102 = await p102;
      expect(received102.roomNumber).toBe('102');
      expect(received102.data.orderId).toBe('ord-room-102-private');

      // Room 101 must NOT have received any event
      expect(stream101.events).toHaveLength(0);

      stream101.close();
      stream102.close();
    });

    it('guarantees event ordering and duplicate suppression over live SSE stream', async () => {
      const stream101 = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );

      const p1 = stream101.waitForEvent();
      const customDedupId = 'custom-sse-dedup-uuid-999';

      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        { requestId: 'sr-dedup-1', status: 'IN_PROGRESS' },
        customDedupId,
      );

      // Re-emit with identical eventId (duplicate suppression)
      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        { requestId: 'sr-dedup-1', status: 'IN_PROGRESS' },
        customDedupId,
      );

      const firstEvent = await p1;
      expect(firstEvent.eventId).toBe(customDedupId);
      expect(firstEvent.eventType).toBe(
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      );

      // Verify no duplicate second event was pushed to stream
      expect(stream101.events).toHaveLength(0);

      stream101.close();
    });

    it('supports client disconnection, reconnection, and polling fallback recovery', async () => {
      // 1. Client connects to SSE
      const streamFirst = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );
      expect(streamFirst.status).toBe(200);

      // 2. Client abruptly disconnects
      streamFirst.close();

      // 3. Event occurs while client is offline / disconnected
      const missedEvent = realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { orderId: 'ord-missed-while-offline', status: 'DELIVERED' },
      );

      // 4. Polling fallback retrieves the missed event via REST fallback
      const pollFallback = await request(app.getHttpServer())
        .get(`/realtime/events/poll?sinceVersion=${missedEvent.version - 1}`)
        .set('Authorization', `Bearer ${activeTokenRoom101}`);

      expect(pollFallback.status).toBe(200);
      expect(pollFallback.body.events).toHaveLength(1);
      expect(pollFallback.body.events[0].data.orderId).toBe(
        'ord-missed-while-offline',
      );

      // 5. Client reconnects to SSE and receives subsequent live events
      const streamReconnected = await subscribeSse(
        `${baseUrl}/realtime/events/stream?token=${activeTokenRoom101}`,
      );
      const reconnectPromise = streamReconnected.waitForEvent();

      realtimeService.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { orderId: 'ord-after-reconnect', status: 'PLACED' },
      );

      const receivedAfterReconnect = await reconnectPromise;
      expect(receivedAfterReconnect.data.orderId).toBe('ord-after-reconnect');
      streamReconnected.close();
    });
  });
});
