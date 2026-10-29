import { beforeEach, describe, expect, it } from '@jest/globals';
import { firstValueFrom } from 'rxjs';
import { RealtimeEventType } from './enums/realtime-event-type.enum.js';
import { RealtimeService } from './realtime.service.js';

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  describe('emitToStay()', () => {
    it('emits an event with monotonic version and server timestamp', () => {
      const event1 = service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { orderId: 'ord-1', status: 'IN_KITCHEN' },
      );

      expect(event1).toBeDefined();
      expect(event1.eventId).toBeDefined();
      expect(event1.roomNumber).toBe('101');
      expect(event1.bookingId).toBe('booking-101');
      expect(event1.eventType).toBe(
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      );
      expect(event1.version).toBe(1);
      expect(event1.serverTimestamp).toBeDefined();
      expect(event1.data).toEqual({ orderId: 'ord-1', status: 'IN_KITCHEN' });

      const event2 = service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { orderId: 'ord-1', status: 'READY' },
      );

      expect(event2.version).toBe(2);
    });

    it('deduplicates duplicate eventId without incrementing version', () => {
      const customId = 'custom-event-uuid-123';

      const event1 = service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        { requestId: 'sr-1' },
        customId,
      );

      const event2 = service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        { requestId: 'sr-1' },
        customId,
      );

      expect(event1.version).toBe(1);
      expect(event2.version).toBe(1);
      expect(event2.eventId).toBe(customId);
    });
  });

  describe('getChannelStream()', () => {
    it('pushes real-time events to active stream subscriber within milliseconds', async () => {
      const stream = service.getChannelStream('booking-101', '101');

      const promise = firstValueFrom(stream);

      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { status: 'DELIVERED' },
      );

      const message = await promise;
      expect(message.data).toBeDefined();
      expect(message.data.eventType).toBe(
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      );
      expect(message.data.roomNumber).toBe('101');
    });

    it('supports multiple tabs/clients for the same room stay', async () => {
      const stream1 = service.getChannelStream('booking-101', '101');
      const stream2 = service.getChannelStream('booking-101', '101');

      const p1 = firstValueFrom(stream1);
      const p2 = firstValueFrom(stream2);

      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        { status: 'COMPLETED' },
      );

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.data.version).toBe(1);
      expect(res2.data.version).toBe(1);
    });

    it('strictly isolates rooms: Room 101 never receives Room 102 events', async () => {
      const stream101 = service.getChannelStream('booking-101', '101');
      const stream102 = service.getChannelStream('booking-102', '102');

      let receivedBy101 = false;
      const sub = stream101.subscribe(() => {
        receivedBy101 = true;
      });

      const p102 = firstValueFrom(stream102);

      service.emitToStay(
        'booking-102',
        '102',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { orderId: 'ord-102' },
      );

      await p102;
      expect(receivedBy101).toBe(false);
      sub.unsubscribe();
    });
  });

  describe('getEventsSince() [Polling Fallback]', () => {
    it('returns buffered events filtered by sinceVersion', () => {
      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { step: 1 },
      );
      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { step: 2 },
      );
      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { step: 3 },
      );

      const all = service.getEventsSince('booking-101', '101');
      expect(all.events).toHaveLength(3);
      expect(all.latestVersion).toBe(3);
      expect(all.recommendedPollIntervalMs).toBe(3000);

      const filtered = service.getEventsSince('booking-101', '101', 2);
      expect(filtered.events).toHaveLength(1);
      expect(filtered.events[0]?.version).toBe(3);
    });

    it('returns empty list for a different room with no events', () => {
      service.emitToStay(
        'booking-101',
        '101',
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        { step: 1 },
      );

      const other = service.getEventsSince('booking-102', '102');
      expect(other.events).toHaveLength(0);
      expect(other.latestVersion).toBe(0);
    });
  });

  describe('revokeStaySessions()', () => {
    it('emits SESSION_REVOKED and cleans up active subscriptions', async () => {
      const stream = service.getChannelStream('booking-101', '101');
      let completed = false;

      stream.subscribe({
        complete: () => {
          completed = true;
        },
      });

      service.revokeStaySessions('booking-101', '101');

      expect(completed).toBe(true);

      const poll = service.getEventsSince('booking-101', '101');
      expect(poll.events).toHaveLength(0);
    });
  });
});
