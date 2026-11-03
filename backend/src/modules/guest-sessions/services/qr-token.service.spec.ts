import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { QrTokenService } from './qr-token.service.js';

describe('QrTokenService', () => {
  let service: QrTokenService;
  let mockCurrentTime: number;

  beforeEach(() => {
    mockCurrentTime = 1700000000000;
    const configService = {
      get: (key: string) =>
        key === 'QR_SIGNING_SECRET'
          ? 'test-secret-key-12345678901234567890'
          : null,
    } as unknown as ConfigService;

    service = new QrTokenService(configService, () => mockCurrentTime);
  });

  describe('createToken and verifyToken', () => {
    it('creates and verifies a valid signed QR token', () => {
      const token = service.createToken('booking-101', '101', 3600000);

      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const payload = service.verifyToken(token);

      expect(payload.bookingId).toBe('booking-101');
      expect(payload.roomNumber).toBe('101');
      expect(payload.issuedAt).toBe(mockCurrentTime);
      expect(payload.expiresAt).toBe(mockCurrentTime + 3600000);
      expect(payload.nonce).toBeDefined();
    });

    it('throws BadRequestException when bookingId or roomNumber is missing', () => {
      expect(() => service.createToken('', '101')).toThrow(BadRequestException);
      expect(() => service.createToken('booking-101', '')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for empty or non-string token', () => {
      expect(() => service.verifyToken('')).toThrow(BadRequestException);
      expect(() => service.verifyToken(null as unknown as string)).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for malformed token structure', () => {
      expect(() => service.verifyToken('malformed-token-without-dot')).toThrow(
        BadRequestException,
      );
      expect(() => service.verifyToken('too.many.dots.here')).toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException when signature is tampered', () => {
      const token = service.createToken('booking-101', '101');
      const [payloadPart] = token.split('.');
      const tamperedToken = `${payloadPart}.tampered_signature_xyz`;

      expect(() => service.verifyToken(tamperedToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when token payload has expired', () => {
      const token = service.createToken('booking-101', '101', 1000);

      // Advance time beyond expiration
      mockCurrentTime += 5000;

      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on token replay with same nonce', () => {
      const token = service.createToken('booking-101', '101');

      // First verification succeeds
      const payload1 = service.verifyToken(token);
      expect(payload1.bookingId).toBe('booking-101');

      // Second verification of same token fails with replay detected
      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('cleans expired nonces on subsequent verification checks', () => {
      const token1 = service.createToken('booking-1', '101', 1000);
      service.verifyToken(token1);

      // Advance clock past expiration
      mockCurrentTime += 2000;

      const token2 = service.createToken('booking-2', '102', 1000);
      const payload2 = service.verifyToken(token2);
      expect(payload2.bookingId).toBe('booking-2');
    });

    it('throws BadRequestException when payload encoding is invalid JSON', () => {
      const invalidJsonPayload =
        Buffer.from('invalid-json-text').toString('base64url');
      const signature = (
        service as unknown as { generateSignature: (d: string) => string }
      ).generateSignature(invalidJsonPayload);
      const token = `${invalidJsonPayload}.${signature}`;

      expect(() => service.verifyToken(token)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when required payload fields are missing', () => {
      const incompletePayload = Buffer.from(
        JSON.stringify({ bookingId: 'b-1' }),
      ).toString('base64url');
      const signature = (
        service as unknown as { generateSignature: (d: string) => string }
      ).generateSignature(incompletePayload);
      const token = `${incompletePayload}.${signature}`;

      expect(() => service.verifyToken(token)).toThrow(BadRequestException);
    });
  });

  describe('getDemoTokens', () => {
    it('provides valid demo tokens for standard room fixtures', () => {
      const tokens = service.getDemoTokens();

      expect(tokens['101-checked-in']).toBeDefined();
      expect(tokens['102-reserved']).toBeDefined();
      expect(tokens['103-checked-out']).toBeDefined();
      expect(tokens['104-cancelled']).toBeDefined();
      expect(tokens['105-expired-window']).toBeDefined();

      const verified = service.verifyToken(tokens['101-checked-in']!);
      expect(verified.roomNumber).toBe('101');
      expect(verified.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
    });

    it('resetDemoNonces resets only demo nonces without clearing non-demo redeemed nonces', () => {
      // 1. Create a non-demo token and verify it (redeem)
      const nonDemoToken = service.createToken('booking-real', '501');
      service.verifyToken(nonDemoToken);

      // 2. Generate and redeem a demo token
      const demoTokens = service.getDemoTokens();
      service.verifyToken(demoTokens['102']!);

      // 3. Reset demo nonces only
      const clearedCount = service.resetDemoNonces();
      expect(clearedCount).toBe(1);

      // 4. Demo token can now be redeemed again (or demo nonces cleared)
      // 5. Non-demo token MUST still be blocked by replay protection
      expect(() => service.verifyToken(nonDemoToken)).toThrow(
        'QR token has already been redeemed (replay detected).',
      );
    });

    it('reset clears all nonces completely', () => {
      const token = service.createToken('booking-test', '101');
      service.verifyToken(token);
      expect(() => service.verifyToken(token)).toThrow('replay detected');

      service.reset();

      // After full reset, token can be redeemed again
      const payload = service.verifyToken(token);
      expect(payload.roomNumber).toBe('101');
    });
  });

  describe('Production Security Enforcement (#101)', () => {
    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    it('fails closed when QR_SIGNING_SECRET is missing in production', () => {
      process.env.NODE_ENV = 'production';
      const configService = {
        get: () => null,
      } as unknown as ConfigService;

      expect(() => new QrTokenService(configService)).toThrow(
        /SECURITY VIOLATION.*dedicated, high-entropy QR_SIGNING_SECRET/i,
      );
    });

    it('fails closed when default development fallback secret is used in production', () => {
      process.env.NODE_ENV = 'production';
      const configService = {
        get: (k: string) =>
          k === 'QR_SIGNING_SECRET'
            ? 'forever-hotel-foss-qr-signing-key-dev-secret-2026'
            : null,
      } as unknown as ConfigService;

      expect(() => new QrTokenService(configService)).toThrow(
        /Default development fallback signing secret is strictly forbidden in production/i,
      );
    });

    it('fails closed when QR_SIGNING_SECRET is shorter than 32 characters in production', () => {
      process.env.NODE_ENV = 'production';
      const configService = {
        get: (k: string) =>
          k === 'QR_SIGNING_SECRET' ? 'short-secret-16ch' : null,
      } as unknown as ConfigService;

      expect(() => new QrTokenService(configService)).toThrow(
        /SECURITY VIOLATION.*at least 32 characters/i,
      );
    });

    it('unconditionally rejects verifyToken in production environments', () => {
      process.env.NODE_ENV = 'production';
      const configService = {
        get: (k: string) =>
          k === 'QR_SIGNING_SECRET'
            ? 'production-high-entropy-qr-secret-key-32-chars-long'
            : null,
      } as unknown as ConfigService;

      const prodService = new QrTokenService(configService);
      const token = prodService.createToken('booking-prod', '101');

      expect(() => prodService.verifyToken(token)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
