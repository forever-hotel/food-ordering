import * as crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BookingVerificationResultDto } from '../../../integrations/internal-services/booking/dto/booking-verification-result.dto.js';
import { BookingVerificationService } from '../../../integrations/internal-services/booking/booking-verification.service.js';
import { GuestSessionResponseDto } from '../dto/guest-session-response.dto.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { FossSessionRepository } from '../repositories/foss-session.repository.js';
import { QrTokenService } from './qr-token.service.js';

@Injectable()
export class GuestSessionsService {
  private readonly logger = new Logger(GuestSessionsService.name);
  private readonly sessionTtlHours: number;
  private readonly clock: () => Date;

  constructor(
    private readonly fossSessionRepository: FossSessionRepository,
    private readonly qrTokenService: QrTokenService,
    private readonly bookingVerificationService: BookingVerificationService,
    private readonly configService: ConfigService,
    @Optional() @Inject('SESSION_CLOCK') clock?: () => Date,
  ) {
    this.clock = clock ?? (() => new Date());
    this.sessionTtlHours = Number(
      this.configService.get<string>('SESSION_TTL_HOURS') || 24,
    );
  }

  /**
   * Hashes a raw bearer token using SHA-256 for secure storage at rest.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Authenticates a guest using a cryptographically signed QR redemption token.
   * Enforces verified checked-in booking, room assignment, and stay window.
   * Atomically upserts an active session under the unique booking constraint.
   */
  async authenticateWithQr(qrToken: string): Promise<GuestSessionResponseDto> {
    if (!qrToken || typeof qrToken !== 'string') {
      throw new BadRequestException('qrToken must be a non-empty string.');
    }

    // 1. Verify QR token signature, expiration, and format
    const qrPayload = this.qrTokenService.verifyToken(qrToken);

    // 2. Authoritatively verify active checked-in stay via BookingVerificationService
    const stay = await this.bookingVerificationService.verifyStay(
      qrPayload.bookingId,
      qrPayload.roomNumber,
    );

    // 3. Compute session expiration: default TTL bounded by stay checkout time
    const now = this.clock();
    const stayEndTime = new Date(stay.stayEnd).getTime();
    const sessionTtlMs = this.sessionTtlHours * 60 * 60 * 1000;
    const computedExpiryTime = Math.min(
      now.getTime() + sessionTtlMs,
      stayEndTime,
    );
    const expiresAt = new Date(computedExpiryTime);

    // 4. Generate high-entropy bearer token and its SHA-256 storage hash
    const rawBearerToken = crypto.randomBytes(32).toString('hex');
    const hashedSessionToken = this.hashToken(rawBearerToken);

    // 5. Handle unique booking constraint: update existing session or create new
    let session = await this.fossSessionRepository.findByBookingId(
      stay.bookingId,
    );

    if (session) {
      this.logger.log(
        `Refreshing existing session [${session.sessionId}] for booking [${stay.bookingId}]`,
      );
      session.sessionToken = hashedSessionToken;
      session.roomNumber = stay.roomNumber;
      session.isActive = true;
      session.expiresAt = expiresAt;
      session.updatedAt = now;
    } else {
      this.logger.log(
        `Creating new session for booking [${stay.bookingId}] and room [${stay.roomNumber}]`,
      );
      session = new FossSession();
      session.sessionId = crypto.randomUUID();
      session.bookingId = stay.bookingId;
      session.roomNumber = stay.roomNumber;
      session.sessionToken = hashedSessionToken;
      session.isActive = true;
      session.createdAt = now;
      session.updatedAt = now;
      session.expiresAt = expiresAt;
    }

    const savedSession = await this.fossSessionRepository.save(session);

    return {
      sessionId: savedSession.sessionId,
      bookingId: savedSession.bookingId,
      roomNumber: savedSession.roomNumber,
      sessionToken: rawBearerToken, // returned to client for Authorization: Bearer
      guestName: stay.guestName,
      stayStart: stay.stayStart,
      stayEnd: stay.stayEnd,
      expiresAt: savedSession.expiresAt.toISOString(),
      createdAt: (savedSession.createdAt || now).toISOString(),
      active: savedSession.isActive,
    };
  }

  /**
   * Validates an incoming bearer session token.
   * Checks expiration and verifies that the guest stay remains active and checked-in.
   */
  async validateSessionToken(
    rawToken: string,
  ): Promise<{ session: FossSession; stay: BookingVerificationResultDto }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Session token is required.');
    }

    const cleanToken = rawToken.trim();
    const hashedToken = this.hashToken(cleanToken);

    // Lookup active session by hashed token, fallback to raw token for backward compatibility
    let session =
      await this.fossSessionRepository.findActiveBySessionToken(hashedToken);

    if (!session) {
      session =
        await this.fossSessionRepository.findActiveBySessionToken(cleanToken);
    }

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Active session not found or revoked.');
    }

    const now = this.clock();
    if (now.getTime() > new Date(session.expiresAt).getTime()) {
      this.logger.warn(`Session [${session.sessionId}] has expired.`);
      session.isActive = false;
      session.updatedAt = now;
      await this.fossSessionRepository.save(session);
      throw new UnauthorizedException('Session has expired.');
    }

    // Re-verify stay status with FDS booking authority to catch mid-stay checkouts
    let stay: BookingVerificationResultDto;
    try {
      stay = await this.bookingVerificationService.verifyStay(
        session.bookingId,
        session.roomNumber,
      );
    } catch (error) {
      this.logger.warn(
        `Stay verification failed for session [${session.sessionId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      session.isActive = false;
      session.updatedAt = now;
      await this.fossSessionRepository.save(session);
      throw new UnauthorizedException(
        'Guest stay has concluded or is no longer checked in.',
      );
    }

    return { session, stay };
  }

  /**
   * Logs out the guest session by marking it inactive.
   */
  async logout(
    rawToken: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Session token is required.');
    }

    const cleanToken = rawToken.trim();
    const hashedToken = this.hashToken(cleanToken);

    let session =
      await this.fossSessionRepository.findActiveBySessionToken(hashedToken);

    if (!session) {
      session =
        await this.fossSessionRepository.findActiveBySessionToken(cleanToken);
    }

    if (session) {
      session.isActive = false;
      session.updatedAt = this.clock();
      await this.fossSessionRepository.save(session);
    }

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }
}
