import * as crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BookingVerificationService } from '../../../integrations/internal-services/booking/booking-verification.service.js';
import { IssueQrDto, IssueQrResponseDto } from '../dto/issue-qr.dto.js';
import { GuestSessionResponseDto } from '../dto/guest-session-response.dto.js';
import { FossQrActivation } from '../entities/foss-qr-activation.entity.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { FossQrActivationRepository } from '../repositories/foss-qr-activation.repository.js';
import { FossSessionRepository } from '../repositories/foss-session.repository.js';

@Injectable()
export class QrActivationService {
  private readonly logger = new Logger(QrActivationService.name);
  private readonly activationTtlMinutes: number;
  private readonly sessionTtlHours: number;
  private readonly frontendBaseUrl: string;
  private readonly clock: () => Date;

  constructor(
    private readonly qrActivationRepository: FossQrActivationRepository,
    private readonly fossSessionRepository: FossSessionRepository,
    private readonly bookingVerificationService: BookingVerificationService,
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() @Inject('QR_ACTIVATION_CLOCK') clock?: () => Date,
  ) {
    if (typeof dataSource === 'function' && !clock) {
      this.clock = dataSource as unknown as () => Date;
      this.dataSource = undefined;
    } else {
      this.clock = clock ?? (() => new Date());
    }
    this.activationTtlMinutes = Number(
      this.configService.get<string>('QR_ACTIVATION_TTL_MINUTES') || 15,
    );
    this.sessionTtlHours = Number(
      this.configService.get<string>('SESSION_TTL_HOURS') || 24,
    );

    const configuredFrontend =
      this.configService.get<string>('FOSS_PUBLIC_APP_URL') ||
      this.configService.get<string>('FOSS_FRONTEND_URL') ||
      this.configService.get<string>('APP_BASE_URL') ||
      'http://localhost:3000';
    this.frontendBaseUrl = configuredFrontend.replace(/\/+$/, '');
  }

  /**
   * Hashes an activation token using SHA-256 for secure storage at rest.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a high-entropy, unpredictable 256-bit activation credential.
   */
  generateActivationToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generates an HTTPS activation URL using configured origin.
   */
  buildActivationUrl(rawToken: string): string {
    return `${this.frontendBaseUrl}/activate?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Issues a secure, single-use, short-lived QR activation credential.
   *
   * Flow:
   * 1. Revalidates booking and assigned room against authoritative FDS stay contract.
   * 2. Atomically revokes previous unredeemed activation credentials for this booking (reissue protection).
   * 3. Generates 256-bit cryptographic token and persists ONLY its SHA-256 hash.
   * 4. Returns non-cacheable HTTPS activation payload to trusted FDS caller.
   */
  async issueActivationCredential(
    dto: IssueQrDto,
  ): Promise<IssueQrResponseDto> {
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const rawBookingId = dto.bookingId?.trim();
    const rawBookingRef = dto.bookingReference?.trim();

    let canonicalBookingId: string;

    if (rawBookingId && rawBookingRef) {
      const isRefUuid = UUID_REGEX.test(rawBookingRef);
      if (!isRefUuid) {
        this.logger.warn(
          `Disparate booking identifier formats: bookingId [${rawBookingId}] (UUID) vs human-readable bookingReference [${rawBookingRef}]. Upstream reference-resolution contract is unavailable.`,
        );
        throw new BadRequestException(
          'Mismatched booking identifier types: bookingReference is not a canonical UUID and cannot be validated against bookingId without an upstream reference-resolution contract.',
        );
      }

      if (rawBookingId.toLowerCase() !== rawBookingRef.toLowerCase()) {
        this.logger.warn(
          `Conflicting booking UUIDs provided: bookingId [${rawBookingId}] vs bookingReference [${rawBookingRef}].`,
        );
        throw new BadRequestException(
          'Conflicting booking identifiers: bookingId and bookingReference specify different UUIDs.',
        );
      }

      canonicalBookingId = rawBookingId;
    } else if (rawBookingId) {
      if (!UUID_REGEX.test(rawBookingId)) {
        throw new BadRequestException(
          'bookingId must be a valid canonical UUID v4.',
        );
      }
      canonicalBookingId = rawBookingId;
    } else if (rawBookingRef) {
      if (!UUID_REGEX.test(rawBookingRef)) {
        this.logger.warn(
          `Direct human-readable bookingReference lookup [${rawBookingRef}] rejected. Upstream reference-resolution contract is unavailable.`,
        );
        throw new BadRequestException(
          'Authoritative booking verification requires a canonical bookingId (UUID v4); human-readable bookingReference lookup is unavailable.',
        );
      }
      canonicalBookingId = rawBookingRef;
    } else {
      throw new BadRequestException(
        'bookingId or valid UUID bookingReference is required.',
      );
    }

    const bookingId = canonicalBookingId;
    const roomNumber = dto.roomNumber?.trim();

    if (!roomNumber) {
      throw new BadRequestException('roomNumber is required.');
    }

    // 1. Authoritatively verify stay with FDS (re-check checked-in status and room binding)
    const stay = await this.bookingVerificationService.verifyStay(
      bookingId,
      roomNumber,
    );

    const now = this.clock();

    // 2. Atomic reissue handling: revoke any outstanding unredeemed activation tokens for this booking
    const revokedCount =
      await this.qrActivationRepository.revokeUnredeemedByBookingId(
        stay.bookingId,
        now,
      );
    if (revokedCount > 0) {
      this.logger.log(
        `Revoked [${revokedCount}] superseded QR activation credential(s) for booking [${stay.bookingId}].`,
      );
    }

    // 3. Compute expiration: bounded by configured TTL (default 15m) and stay checkout timestamp
    const stayEndTime = new Date(stay.stayEnd).getTime();
    const ttlMs = this.activationTtlMinutes * 60 * 1000;
    const computedExpiryTime = Math.min(now.getTime() + ttlMs, stayEndTime);
    const expiresAt = new Date(computedExpiryTime);

    // 4. Generate opaque credential and its storage hash
    const rawToken = this.generateActivationToken();
    const tokenHash = this.hashToken(rawToken);

    const activation = new FossQrActivation();
    activation.activationId = crypto.randomUUID();
    activation.bookingId = stay.bookingId;
    activation.roomNumber = stay.roomNumber;
    activation.tokenHash = tokenHash;
    activation.expiresAt = expiresAt;
    activation.redeemedAt = null;
    activation.revokedAt = null;
    activation.createdAt = now;
    activation.issuedBy = dto.issuedBy || 'FDS_CHECK_IN';

    await this.qrActivationRepository.save(activation);

    const activationUrl = this.buildActivationUrl(rawToken);
    const validUntilDate = dto.checkOutDate || stay.stayEnd;

    this.logger.log(
      `Issued single-use QR activation [${activation.activationId}] for booking [${stay.bookingId}] room [${stay.roomNumber}], expires at [${expiresAt.toISOString()}]`,
    );

    return {
      status: 'ACTIVATED',
      sessionReference: activation.activationId,
      activationUrl,
      qrToken: rawToken,
      expiresAt: expiresAt.toISOString(),
      validUntilDate,
    };
  }

  /**
   * Atomically redeems a single-use QR activation credential.
   *
   * Transaction & Concurrency Guarantees:
   * 1. Pre-validation & Stay Check: Validates credential existence, expiry, and revocation,
   *    and authoritatively verifies stay with FDS before touching the database (so failed stays never burn the token).
   * 2. Single Atomic Transaction: Wraps both conditional activation consumption and session upsert
   *    within a single TypeORM transaction via DataSource.transaction(async manager => ...).
   * 3. Row-level Concurrency: The conditional update (`UPDATE ... WHERE redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now`)
   *    enforces row locking in PostgreSQL. Only one concurrent request can match and update the row.
   * 4. Rollback Protection: If session creation fails for any reason inside the transaction, the entire
   *    transaction is rolled back, preserving the unredeemed status of the activation slip.
   */
  async redeemActivationCredential(
    rawToken: string,
  ): Promise<GuestSessionResponseDto> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('Activation token is required.');
    }

    const cleanToken = rawToken.trim();
    const tokenHash = this.hashToken(cleanToken);
    const now = this.clock();

    // 1. Diagnostic inspection before database mutation
    const existing =
      await this.qrActivationRepository.findByTokenHash(tokenHash);

    if (!existing) {
      this.logger.warn('QR activation failed: Token hash not found.');
      throw new UnauthorizedException('Invalid QR activation credential.');
    }

    if (existing.revokedAt) {
      this.logger.warn(
        `QR activation failed: Credential [${existing.activationId}] was revoked on [${existing.revokedAt.toISOString()}].`,
      );
      throw new UnauthorizedException(
        'This QR slip has been replaced or revoked. Please obtain a fresh QR slip from the Front Desk.',
      );
    }

    if (existing.redeemedAt) {
      this.logger.warn(
        `QR activation failed: Replay detected. Credential [${existing.activationId}] was already redeemed at [${existing.redeemedAt.toISOString()}].`,
      );
      throw new UnauthorizedException(
        'This QR slip has already been redeemed. For security, QR credentials are single-use only.',
      );
    }

    if (now.getTime() > new Date(existing.expiresAt).getTime()) {
      this.logger.warn(
        `QR activation failed: Credential [${existing.activationId}] expired at [${existing.expiresAt.toISOString()}].`,
      );
      throw new UnauthorizedException(
        'This QR slip has expired. Please request a new activation slip from the Front Desk.',
      );
    }

    // 2. Authoritatively verify stay with FDS before starting database transaction
    // If FDS rejects the stay or is unreachable, this throws and the token is NEVER consumed
    const stay = await this.bookingVerificationService.verifyStay(
      existing.bookingId,
      existing.roomNumber,
    );

    // 3. Compute session duration: bounded by session TTL (default 24h) and stay checkout time
    const stayEndTime = new Date(stay.stayEnd).getTime();
    const sessionTtlMs = this.sessionTtlHours * 60 * 60 * 1000;
    const computedExpiryTime = Math.min(
      now.getTime() + sessionTtlMs,
      stayEndTime,
    );
    const sessionExpiresAt = new Date(computedExpiryTime);

    // 4. Generate high-entropy bearer token and store its SHA-256 hash
    const rawBearerToken = crypto.randomBytes(32).toString('hex');
    const hashedSessionToken = crypto
      .createHash('sha256')
      .update(rawBearerToken)
      .digest('hex');

    // 5. Fail closed if database transaction support is not configured
    if (!this.dataSource) {
      this.logger.error(
        'Database transaction manager (DataSource) is unconfigured. Failing closed.',
      );
      throw new ServiceUnavailableException(
        'Database transaction support is required for atomic QR redemption.',
      );
    }

    // 6. Mandatory atomic transaction: both consumption and session creation use the same EntityManager
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // a. Atomic conditional consumption inside transaction
      const redeemedActivation =
        await this.qrActivationRepository.atomicRedeemWithManager(
          manager,
          tokenHash,
          now,
        );

      if (!redeemedActivation) {
        this.logger.warn(
          `QR activation failed: Replay or concurrent consumption detected for credential [${existing.activationId}].`,
        );
        throw new UnauthorizedException(
          'This QR slip has already been redeemed. For security, QR credentials are single-use only.',
        );
      }

      // b. Atomic session upsert using the same transaction manager
      let session = await manager.findOne(FossSession, {
        where: { bookingId: stay.bookingId },
      });

      if (session) {
        session.sessionToken = hashedSessionToken;
        session.roomNumber = stay.roomNumber;
        session.isActive = true;
        session.expiresAt = sessionExpiresAt;
        session.updatedAt = now;
      } else {
        session = new FossSession();
        session.sessionId = crypto.randomUUID();
        session.bookingId = stay.bookingId;
        session.roomNumber = stay.roomNumber;
        session.sessionToken = hashedSessionToken;
        session.isActive = true;
        session.createdAt = now;
        session.updatedAt = now;
        session.expiresAt = sessionExpiresAt;
      }

      const savedSession = await manager.save(session);

      this.logger.log(
        `QR activation [${redeemedActivation.activationId}] successfully established session [${savedSession.sessionId}] for room [${stay.roomNumber}]`,
      );

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
    });
  }

  /**
   * Revokes all pending/unredeemed activation credentials for a booking.
   * Invoked upon checkout or room reassignment events.
   */
  async revokeBookingActivations(bookingId: string): Promise<number> {
    if (!bookingId) return 0;
    return this.qrActivationRepository.revokeUnredeemedByBookingId(
      bookingId.trim(),
      this.clock(),
    );
  }
}
