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
  });
});
