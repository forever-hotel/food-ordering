import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { of } from 'rxjs';
import type { GuestContext } from '../modules/guest-sessions/interfaces/guest-context.interface.js';
import { PollEventsQueryDto } from './dto/poll-events-query.dto.js';
import { FossRealtimeEvent } from './dto/realtime-event.dto.js';
import { RealtimeEventType } from './enums/realtime-event-type.enum.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';

describe('RealtimeController', () => {
  let controller: RealtimeController;
  let service: jest.Mocked<RealtimeService>;

  const sampleGuest: GuestContext = {
    sessionId: 'session-101',
    bookingId: 'booking-101',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    role: 'GUEST',
  };

  const sampleEvent: FossRealtimeEvent = {
    eventId: 'evt-101',
    eventType: RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
    roomNumber: '101',
    bookingId: 'booking-101',
    version: 1,
    serverTimestamp: new Date().toISOString(),
    data: { status: 'DELIVERED' },
  };

  beforeEach(() => {
    service = {
      getChannelStream: jest
        .fn<any>()
        .mockReturnValue(of({ data: sampleEvent })),
      getEventsSince: jest.fn<any>().mockReturnValue({
        events: [sampleEvent],
        serverTimestamp: new Date().toISOString(),
        latestVersion: 1,
        recommendedPollIntervalMs: 3000,
      }),
    } as unknown as jest.Mocked<RealtimeService>;

    controller = new RealtimeController(service);
  });

  describe('streamEvents()', () => {
    it('delegates SSE channel stream to RealtimeService', (done) => {
      const stream = controller.streamEvents(sampleGuest);

      expect(service.getChannelStream).toHaveBeenCalledWith(
        sampleGuest.bookingId,
        sampleGuest.roomNumber,
      );

      stream.subscribe({
        next: (val) => {
          expect(val.data).toEqual(sampleEvent);
          done();
        },
      });
    });
  });

  describe('pollEvents()', () => {
    it('delegates polling query to RealtimeService', () => {
      const query: PollEventsQueryDto = {
        sinceVersion: 0,
      };

      const result = controller.pollEvents(sampleGuest, query);

      expect(service.getEventsSince).toHaveBeenCalledWith(
        sampleGuest.bookingId,
        sampleGuest.roomNumber,
        0,
        undefined,
      );
      expect(result.events).toEqual([sampleEvent]);
    });
  });
});
