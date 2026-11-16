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

export interface QrTokenPayload {
  bookingId: string;
  roomNumber: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

const DEFAULT_DEV_SIGNING_SECRET =
  'forever-hotel-foss-qr-signing-key-dev-secret-2026';

@Injectable()
export class QrTokenService {
  private readonly logger = new Logger(QrTokenService.name);
  private readonly signingSecret: string;
  private readonly seenNonces = new Map<string, number>();
  private readonly demoNonces = new Set<string>();

  private readonly clock: () => number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject('QR_CLOCK') clock?: () => number,
  ) {
    this.clock = clock ?? (() => Date.now());
    const configuredSecret =
      this.configService.get<string>('QR_SIGNING_SECRET');
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction) {
      if (
        !configuredSecret ||
        configuredSecret === DEFAULT_DEV_SIGNING_SECRET ||
        configuredSecret.length < 32
      ) {
        throw new Error(
          'SECURITY VIOLATION: Production requires a dedicated, high-entropy QR_SIGNING_SECRET (at least 32 characters). Default development fallback signing secret is strictly forbidden in production.',
        );
      }
      this.signingSecret = configuredSecret;
    } else {
      this.signingSecret = configuredSecret || DEFAULT_DEV_SIGNING_SECRET;
    }
  }

  /**
   * Generates a signed QR redemption token for a room and booking.
   */
  createToken(
    bookingId: string,
    roomNumber: string,
    ttlMs: number = 24 * 60 * 60 * 1000,
    isDemo: boolean = false,
  ): string {
    if (!bookingId || !roomNumber) {
      throw new BadRequestException('bookingId and roomNumber are required.');
    }

    const now = this.clock();
    const nonce = crypto.randomUUID();
    if (isDemo) {
      this.demoNonces.add(nonce);
    }
    const payload: QrTokenPayload = {
      bookingId: bookingId.trim(),
      roomNumber: roomNumber.trim(),
      issuedAt: now,
      expiresAt: now + ttlMs,
      nonce,
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.generateSignature(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  /**
   * Verifies and decodes a signed QR token.
   * Enforces cryptographic integrity, expiration, and replay protection.
   */
  verifyToken(qrToken: string): QrTokenPayload {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction) {
      throw new UnauthorizedException(
        'Legacy signed QR tokens are strictly disabled in production environments.',
      );
    }

    if (!qrToken || typeof qrToken !== 'string') {
      throw new BadRequestException('QR token is required.');
    }

    const parts = qrToken.trim().split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed QR token format.');
    }

    const [encodedPayload, providedSignature] = parts;

    // Cryptographic signature verification
    const expectedSignature = this.generateSignature(encodedPayload);
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(providedSignature, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      this.logger.warn(
        'QR token signature verification failed (tampered or forged).',
      );
      throw new UnauthorizedException('Invalid or forged QR token.');
    }

    // Decode and validate payload
    let payload: QrTokenPayload;
    try {
      const decodedJson = Buffer.from(encodedPayload, 'base64url').toString(
        'utf8',
      );
      payload = JSON.parse(decodedJson);
    } catch {
      throw new BadRequestException('Invalid QR token payload encoding.');
    }

    if (
      !payload.bookingId ||
      !payload.roomNumber ||
      typeof payload.expiresAt !== 'number' ||
      !payload.nonce
    ) {
      throw new BadRequestException(
        'QR token payload is missing required fields.',
      );
    }

    // Expiry check
    const now = this.clock();
    if (now > payload.expiresAt) {
      this.logger.warn(
        `QR token expired at ${new Date(payload.expiresAt).toISOString()}`,
      );
      throw new UnauthorizedException('QR token has expired.');
    }

    // Replay check
    this.cleanExpiredNonces(now);
    if (this.seenNonces.has(payload.nonce)) {
      this.logger.warn(`QR token replay detected for nonce ${payload.nonce}`);
      throw new UnauthorizedException(
        'QR token has already been redeemed (replay detected).',
      );
    }

    // Record nonce to prevent replay during validity window
    this.seenNonces.set(payload.nonce, payload.expiresAt);

    return payload;
  }

  /**
   * Returns pre-signed QR tokens for the standard demo fixtures.
   */
  getDemoTokens(): Record<string, string> {
    return {
      'Room 101 (John Doe)': this.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
        undefined,
        true,
      ),
      'Room 102 (Jane Smith)': this.createToken(
        'b1020000-0000-4000-8000-000000000102',
        '102',
        undefined,
        true,
      ),
      'Room 103 (Robert Frost)': this.createToken(
        'b1030000-0000-4000-8000-000000000103',
        '103',
        undefined,
        true,
      ),
      'Room 204 (Alice Wong)': this.createToken(
        'b2040000-0000-4000-8000-000000000204',
        '204',
        undefined,
        true,
      ),
      'Room 999 (Expired Session)': this.createToken(
        'b9990000-0000-4000-8000-000000000999',
        '999',
        -24 * 60 * 60 * 1000,
        true,
      ),
      '101': this.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
        undefined,
        true,
      ),
      '102': this.createToken(
        'b1020000-0000-4000-8000-000000000102',
        '102',
        undefined,
        true,
      ),
      '103': this.createToken(
        'b1030000-0000-4000-8000-000000000103',
        '103',
        undefined,
        true,
      ),
      '204': this.createToken(
        'b2040000-0000-4000-8000-000000000204',
        '204',
        undefined,
        true,
      ),
      '999': this.createToken(
        'b9990000-0000-4000-8000-000000000999',
        '999',
        -24 * 60 * 60 * 1000,
        true,
      ),
      '101-checked-in': this.createToken(
        'b1010000-0000-4000-8000-000000000101',
        '101',
        undefined,
        true,
      ),
      '102-reserved': this.createToken(
        'b1060000-0000-4000-8000-000000000106',
        '106',
        undefined,
        true,
      ),
      '103-checked-out': this.createToken(
        'b1070000-0000-4000-8000-000000000107',
        '107',
        undefined,
        true,
      ),
      '104-cancelled': this.createToken(
        'b1040000-0000-4000-8000-000000000104',
        '104',
        undefined,
        true,
      ),
      '105-expired-window': this.createToken(
        'b1050000-0000-4000-8000-000000000105',
        '105',
        undefined,
        true,
      ),
    };
  }

  /**
   * Resets only nonces redeemed from demonstration tokens, preserving replay protection
   * for non-demo tokens in shared environments.
   */
  public resetDemoNonces(): number {
    let count = 0;
    for (const nonce of this.demoNonces) {
      if (this.seenNonces.delete(nonce)) {
        count++;
      }
    }
    this.demoNonces.clear();
    return count;
  }

  /**
   * Cleans up all in-memory redeemed nonces (used during full test reset).
   */
  public reset(): void {
    this.seenNonces.clear();
    this.demoNonces.clear();
  }

  private generateSignature(data: string): string {
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(data)
      .digest('base64url');
  }

  private cleanExpiredNonces(now: number): void {
    for (const [nonce, expiresAt] of this.seenNonces.entries()) {
      if (now > expiresAt) {
        this.seenNonces.delete(nonce);
      }
    }
  }
}
