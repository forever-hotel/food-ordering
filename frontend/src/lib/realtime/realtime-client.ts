export const RealtimeEventType = {
  FOOD_ORDER_STATUS_UPDATED: 'FOOD_ORDER_STATUS_UPDATED',
  SERVICE_REQUEST_STATUS_UPDATED: 'SERVICE_REQUEST_STATUS_UPDATED',
  COMPLAINT_STATUS_UPDATED: 'COMPLAINT_STATUS_UPDATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  HEARTBEAT: 'HEARTBEAT',
} as const;
export type RealtimeEventType = (typeof RealtimeEventType)[keyof typeof RealtimeEventType];

export interface FossRealtimeEvent<T = unknown> {
  eventId: string;
  eventType: RealtimeEventType;
  roomNumber: string;
  bookingId: string;
  version: number;
  serverTimestamp: string;
  data: T;
}

export interface PollEventsResponse {
  events: FossRealtimeEvent[];
  serverTimestamp: string;
  latestVersion: number;
  recommendedPollIntervalMs: number;
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'FALLBACK_POLLING' | 'DISCONNECTED';

export interface RealtimeClientConfig {
  apiUrl: string;
  sessionToken: string;
  bookingId: string;
  roomNumber: string;
  maxReconnectAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  pollIntervalMs?: number;
  onEvent?: (event: FossRealtimeEvent) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

import { getDataMode } from '../data-mode/data-mode.ts';
import { DemoStateStore } from '../data-mode/demo/demo-state-store.ts';

export class FossRealtimeClient {
  private status: ConnectionStatus = 'DISCONNECTED';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private pollIntervalMs: number;

  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVersion = 0;
  private readonly seenEventIds = new Set<string>();
  private readonly config: RealtimeClientConfig;
  private demoUnsubscribe: (() => void) | null = null;

  constructor(config: RealtimeClientConfig) {
    this.config = config;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
    this.maxBackoffMs = config.maxBackoffMs ?? 5000;
    this.pollIntervalMs = config.pollIntervalMs ?? 3000;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getSubscriptionContext(): { bookingId?: string; roomNumber?: string } {
    return {
      bookingId: this.config.bookingId,
      roomNumber: this.config.roomNumber,
    };
  }

  public connect(): void {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING') {
      return;
    }

    this.setStatus('CONNECTING');

    // In Demo Mode, hook directly into the deterministic DemoStateStore event emitter
    if (getDataMode() === 'demo') {
      this.setStatus('CONNECTED');
      this.demoUnsubscribe = DemoStateStore.getInstance().addRealtimeListener((event) => {
        if (
          event.roomNumber === this.config.roomNumber &&
          event.bookingId === this.config.bookingId
        ) {
          this.config.onEvent?.(event);
        }
      });
      return;
    }

    // In API Mode: if EventSource is available, attempt real SSE stream
    if (typeof EventSource !== 'undefined') {
      this.initEventSource();
    } else {
      // Fallback directly to HTTP polling
      this.startPollingFallback();
    }
  }

  public disconnect(): void {
    this.setStatus('DISCONNECTED');
    this.reconnectAttempts = 0;

    if (this.demoUnsubscribe) {
      this.demoUnsubscribe();
      this.demoUnsubscribe = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private initEventSource(): void {
    try {
      const token = this.config.sessionToken?.trim();
      const queryParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const url = `${this.config.apiUrl}/realtime/events/stream${queryParam}`;
      // Note: native EventSource does not support custom headers, so standard
      // token query parameter passing is used for SSE stream authentication
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
      };

      this.eventSource.onmessage = (messageEvent) => {
        try {
          const parsed = JSON.parse(messageEvent.data) as FossRealtimeEvent;
          this.handleIncomingEvent(parsed);
        } catch {
          // ignore parsing error
        }
      };

      this.eventSource.onerror = (err) => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }

        this.config.onError?.(new Error(`SSE connection error: ${JSON.stringify(err)}`));
        this.handleReconnectOrFallback();
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.config.onError?.(error);
      this.handleReconnectOrFallback();
    }
  }

  private handleReconnectOrFallback(): void {
    if (this.status === 'DISCONNECTED') return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoff = Math.min(
        this.initialBackoffMs * Math.pow(1.5, this.reconnectAttempts - 1),
        this.maxBackoffMs,
      );

      this.setStatus('CONNECTING');
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, backoff);
    } else {
      // Reconnection exhausted -> Switch to continuous polling fallback
      this.startPollingFallback();
    }
  }

  private startPollingFallback(): void {
    if (this.status === 'DISCONNECTED') return;
    this.setStatus('FALLBACK_POLLING');
    this.scheduleNextPoll(0);
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.status !== 'FALLBACK_POLLING') return;

    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollOnce();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.config.onError?.(error);
      } finally {
        if (this.status === 'FALLBACK_POLLING') {
          this.scheduleNextPoll(this.pollIntervalMs);
        }
      }
    }, delayMs);
  }

  public async pollOnce(): Promise<void> {
    const url = new URL(`${this.config.apiUrl}/realtime/events/poll`);
    if (this.lastVersion > 0) {
      url.searchParams.set('sinceVersion', String(this.lastVersion));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Polling failed with status ${response.status}`);
    }

    const body = (await response.json()) as PollEventsResponse;
    if (body.recommendedPollIntervalMs) {
      this.pollIntervalMs = body.recommendedPollIntervalMs;
    }
    if (body.latestVersion) {
      this.lastVersion = Math.max(this.lastVersion, body.latestVersion);
    }

    if (Array.isArray(body.events)) {
      for (const event of body.events) {
        this.handleIncomingEvent(event);
      }
    }
  }

  private handleIncomingEvent(event: FossRealtimeEvent): void {
    // 1. Guard against foreign room/booking events (client-side sanity check)
    if (event.roomNumber !== this.config.roomNumber || event.bookingId !== this.config.bookingId) {
      return;
    }

    // 2. Deduplicate event IDs
    if (this.seenEventIds.has(event.eventId)) {
      return;
    }
    this.seenEventIds.add(event.eventId);

    // 3. Track version
    if (event.version > this.lastVersion) {
      this.lastVersion = event.version;
    }

    // 4. Handle session revocation
    if (event.eventType === RealtimeEventType.SESSION_REVOKED) {
      this.disconnect();
    }

    // 5. Notify listener
    this.config.onEvent?.(event);
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.config.onStatusChange?.(newStatus);
    }
  }
}
