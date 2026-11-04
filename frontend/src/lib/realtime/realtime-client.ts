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

/**
 * Global registry of active realtime clients across tabs and components.
 * Enables immediate teardown when guests log out or switch stays.
 */
const activeRealtimeClients = new Set<FossRealtimeClient>();

/**
 * Forcibly disconnects and cleans up all active SSE streams.
 * Prevents cross-room event contamination during room transitions.
 */
export function disconnectAllRealtimeClients(): void {
  for (const client of activeRealtimeClients) {
    try {
      client.disconnect();
    } catch {
      // Safe teardown isolation
    }
  }
  activeRealtimeClients.clear();
}

export class FossRealtimeClient {
  private status: ConnectionStatus = 'DISCONNECTED';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private pollIntervalMs: number;

  private abortController: AbortController | null = null;
  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVersion = 0;
  private readonly seenEventIds = new Set<string>();
  private readonly config: RealtimeClientConfig;

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
    if (this.status === 'CONNECTED') {
      return;
    }
    if (this.status === 'CONNECTING' && this.abortController) {
      return;
    }

    activeRealtimeClients.add(this);
    this.setStatus('CONNECTING');

    // Prefer secure fetch-based streaming with Authorization header; fallback to polling
    if (typeof fetch !== 'undefined') {
      void this.startFetchStream();
    } else {
      this.startPollingFallback();
    }
  }

  public disconnect(): void {
    activeRealtimeClients.delete(this);
    this.setStatus('DISCONNECTED');
    this.reconnectAttempts = 0;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
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

  /**
   * Connects via fetch-based streaming. Passes the bearer token strictly in the
   * Authorization HTTP header, completely eliminating security risks associated
   * with tokens in query strings and proxy URL logs.
   */
  private async startFetchStream(): Promise<void> {
    this.abortController = new AbortController();
    const token = this.config.sessionToken?.trim();
    const url = `${this.config.apiUrl}/realtime/events/stream`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection error: HTTP ${response.status}`);
      }

      if (!response.body) {
        // Fallback to polling if readable body is not supported
        this.startPollingFallback();
        return;
      }

      this.reconnectAttempts = 0;
      this.setStatus('CONNECTED');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          for (const line of trimmed.split('\n')) {
            if (line.startsWith('data:')) {
              const dataStr = line.slice(5).trim();
              if (dataStr) {
                try {
                  const parsed = JSON.parse(dataStr) as FossRealtimeEvent;
                  this.handleIncomingEvent(parsed);
                } catch {
                  // ignore heartbeat or parsing errors
                }
              }
            }
          }
        }
      }

      // Stream closed by server
      if (this.status !== 'DISCONNECTED') {
        this.handleReconnectOrFallback();
      }
    } catch (err: unknown) {
      if (this.abortController?.signal.aborted) {
        return; // normal intentional disconnect
      }
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
        void this.startFetchStream();
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
