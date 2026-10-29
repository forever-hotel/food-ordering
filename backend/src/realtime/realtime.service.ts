import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PollEventsResponseDto } from './dto/poll-events-response.dto.js';
import { FossRealtimeEvent } from './dto/realtime-event.dto.js';
import { RealtimeEventType } from './enums/realtime-event-type.enum.js';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly maxBufferSize = 100;
  private readonly defaultPollIntervalMs = 3000;

  private readonly channelBuffers = new Map<
    string,
    FossRealtimeEvent<unknown>[]
  >();
  private readonly channelVersions = new Map<string, number>();
  private readonly channelSubjects = new Map<
    string,
    Subject<FossRealtimeEvent<unknown>>
  >();
  private readonly processedEventIds = new Set<string>();

  /**
   * Generates a canonical channel identifier bound strictly to booking and room.
   */
  public getChannelKey(bookingId: string, roomNumber: string): string {
    return `${bookingId}:${roomNumber}`;
  }

  /**
   * Emits a typed real-time event to an authenticated guest stay channel.
   * Increments the channel monotonic version, buffers the event, and pushes to active streams.
   */
  public emitToStay<T>(
    bookingId: string,
    roomNumber: string,
    eventType: RealtimeEventType,
    data: T,
    customEventId?: string,
  ): FossRealtimeEvent<T> {
    const eventId = customEventId || randomUUID();

    // Deduplicate event ID
    if (this.processedEventIds.has(eventId)) {
      this.logger.log(
        `Duplicate realtime event [${eventId}] discarded for stay [${bookingId}:${roomNumber}].`,
      );
      const channelKey = this.getChannelKey(bookingId, roomNumber);
      const existing = this.channelBuffers
        .get(channelKey)
        ?.find((e) => e.eventId === eventId);
      if (existing) {
        return existing as FossRealtimeEvent<T>;
      }
    }

    const channelKey = this.getChannelKey(bookingId, roomNumber);
    const currentVersion = this.channelVersions.get(channelKey) ?? 0;
    const nextVersion = currentVersion + 1;
    this.channelVersions.set(channelKey, nextVersion);

    const now = new Date().toISOString();
    const event: FossRealtimeEvent<T> = {
      eventId,
      eventType,
      roomNumber,
      bookingId,
      version: nextVersion,
      serverTimestamp: now,
      data,
    };

    // Buffer event for gap recovery and polling fallback
    let buffer = this.channelBuffers.get(channelKey);
    if (!buffer) {
      buffer = [];
      this.channelBuffers.set(channelKey, buffer);
    }
    buffer.push(event as FossRealtimeEvent<unknown>);
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    this.processedEventIds.add(eventId);

    // Push to active SSE stream subscribers
    const subject = this.channelSubjects.get(channelKey);
    if (subject) {
      subject.next(event as FossRealtimeEvent<unknown>);
    }

    this.logger.log(
      `Realtime event [${eventType}] emitted to channel [${channelKey}] v${nextVersion} (id: ${eventId}).`,
    );

    return event;
  }

  /**
   * Provides an Observable stream for SSE streaming, filtered strictly to the caller's room stay.
   */
  public getChannelStream(
    bookingId: string,
    roomNumber: string,
  ): Observable<{ data: FossRealtimeEvent<unknown> }> {
    const channelKey = this.getChannelKey(bookingId, roomNumber);
    let subject = this.channelSubjects.get(channelKey);
    if (!subject) {
      subject = new Subject<FossRealtimeEvent<unknown>>();
      this.channelSubjects.set(channelKey, subject);
    }

    return subject.asObservable().pipe(map((event) => ({ data: event })));
  }

  /**
   * Retrieves buffered events since a given version or timestamp for REST polling fallback.
   */
  public getEventsSince(
    bookingId: string,
    roomNumber: string,
    sinceVersion?: number,
    sinceTimestamp?: string,
  ): PollEventsResponseDto {
    const channelKey = this.getChannelKey(bookingId, roomNumber);
    const buffer = this.channelBuffers.get(channelKey) || [];
    const latestVersion = this.channelVersions.get(channelKey) || 0;
    const now = new Date().toISOString();

    let filtered = buffer;

    if (sinceVersion !== undefined && sinceVersion >= 0) {
      filtered = filtered.filter((e) => e.version > sinceVersion);
    }

    if (sinceTimestamp) {
      const sinceTime = new Date(sinceTimestamp).getTime();
      if (!isNaN(sinceTime)) {
        filtered = filtered.filter(
          (e) => new Date(e.serverTimestamp).getTime() > sinceTime,
        );
      }
    }

    return {
      events: filtered,
      serverTimestamp: now,
      latestVersion,
      recommendedPollIntervalMs: this.defaultPollIntervalMs,
    };
  }

  /**
   * Revokes a stay channel (e.g. upon guest checkout or room reassignment).
   * Emits SESSION_REVOKED and cleans up subscriptions.
   */
  public revokeStaySessions(bookingId: string, roomNumber: string): void {
    const channelKey = this.getChannelKey(bookingId, roomNumber);
    this.logger.log(
      `Revoking active realtime channel for stay [${channelKey}].`,
    );

    this.emitToStay(bookingId, roomNumber, RealtimeEventType.SESSION_REVOKED, {
      message: 'Guest stay session has ended or room has been reassigned.',
      occurredAt: new Date().toISOString(),
    });

    const subject = this.channelSubjects.get(channelKey);
    if (subject) {
      subject.complete();
      this.channelSubjects.delete(channelKey);
    }

    this.channelBuffers.delete(channelKey);
    this.channelVersions.delete(channelKey);
  }

  /**
   * Cleans up all state (primarily for test fixture resetting).
   */
  public clearAll(): void {
    for (const subject of this.channelSubjects.values()) {
      subject.complete();
    }
    this.channelSubjects.clear();
    this.channelBuffers.clear();
    this.channelVersions.clear();
    this.processedEventIds.clear();
  }
}
