import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BookingStatus } from '../enums/booking-status.enum.js';
import {
  BookingProvider,
  BookingRecord,
} from '../interfaces/booking-provider.interface.js';

interface FdsBookingResponse {
  bookingId: string;
  roomNumber: string;
  status: string;
  stayStart: string;
  stayEnd: string;
  guestName?: string;
}

/**
 * Production HTTP adapter connecting to the authoritative Front Desk Subsystem (FDS/HW).
 * Fails closed safely if the upstream service is unconfigured or unreachable.
 */
@Injectable()
export class RealBookingAdapter implements BookingProvider {
  private readonly logger = new Logger(RealBookingAdapter.name);

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
    private readonly timeoutMs: number = 5000,
  ) {}

  async getBookingById(bookingId: string): Promise<BookingRecord | null> {
    this.ensureConfigured();

    const url = `${this.baseUrl}/api/v1/bookings/${encodeURIComponent(bookingId)}`;
    const response = await this.executeRequest(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      this.handleHttpError(response.status);
    }

    const data = (await response.json()) as FdsBookingResponse;
    return this.mapToRecord(data);
  }

  async verifyBooking(
    bookingId: string,
    roomNumber: string,
  ): Promise<BookingRecord> {
    this.ensureConfigured();

    const url = `${this.baseUrl}/api/v1/bookings/${encodeURIComponent(bookingId)}/verify`;
    const response = await this.executeRequest(url, {
      method: 'POST',
      body: JSON.stringify({ roomNumber }),
    });

    if (response.status === 404) {
      throw new NotFoundException(`Booking not found: ${bookingId}`);
    }

    if (response.status === 403) {
      throw new ForbiddenException(
        'Stay verification rejected by Front Desk Subsystem.',
      );
    }

    if (!response.ok) {
      this.handleHttpError(response.status);
    }

    const data = (await response.json()) as FdsBookingResponse;
    const record = this.mapToRecord(data);

    if (record.roomNumber !== roomNumber) {
      throw new ForbiddenException(
        `Room number mismatch: booking is assigned to room ${record.roomNumber}, not ${roomNumber}`,
      );
    }

    if (record.status !== BookingStatus.CHECKED_IN) {
      throw new ForbiddenException(
        `Booking is in ${record.status} state, not CHECKED_IN.`,
      );
    }

    return record;
  }

  private ensureConfigured(): void {
    if (!this.baseUrl || this.baseUrl.trim() === '') {
      this.logger.error(
        'FDS Booking service URL is missing or unconfigured. Failing closed.',
      );
      throw new ServiceUnavailableException(
        'Authoritative Booking verification service is unavailable.',
      );
    }
  }

  private async executeRequest(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers as Record<string, string>),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Upstream FDS HTTP request failed: ${message}`);
      throw new ServiceUnavailableException(
        'Authoritative Booking verification service is currently unreachable.',
      );
    }
  }

  private handleHttpError(status: number): never {
    this.logger.warn(`Upstream FDS service returned HTTP status ${status}`);
    if (status >= 500) {
      throw new ServiceUnavailableException(
        'Authoritative Booking verification service encountered an internal error.',
      );
    }
    throw new ForbiddenException(
      'Stay verification could not be completed with upstream provider.',
    );
  }

  private mapToRecord(data: FdsBookingResponse): BookingRecord {
    if (!data || !data.bookingId || !data.roomNumber || !data.status) {
      throw new ServiceUnavailableException(
        'Malformed stay verification payload received from upstream provider.',
      );
    }

    const stayStart = new Date(data.stayStart);
    const stayEnd = new Date(data.stayEnd);

    if (Number.isNaN(stayStart.getTime()) || Number.isNaN(stayEnd.getTime())) {
      throw new ServiceUnavailableException(
        'Invalid stay timestamps received from upstream provider.',
      );
    }

    return {
      bookingId: data.bookingId,
      roomNumber: data.roomNumber,
      status: data.status as BookingStatus,
      stayStart,
      stayEnd,
      guestName: data.guestName,
    };
  }
}
