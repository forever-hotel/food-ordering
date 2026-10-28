import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BookingVerificationResultDto } from '../../../integrations/internal-services/booking/dto/booking-verification-result.dto.js';
import { BookingVerificationService } from '../../../integrations/internal-services/booking/booking-verification.service.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { FossSessionRepository } from '../repositories/foss-session.repository.js';
import { GuestSessionsService } from './guest-sessions.service.js';
import { QrTokenPayload, QrTokenService } from './qr-token.service.js';

describe('GuestSessionsService', () => {
  let service: GuestSessionsService;
  let mockSessionRepository: {
    findByBookingId: jest.MockedFunction<
      (id: string) => Promise<FossSession | null>
    >;
    findActiveBySessionToken: jest.MockedFunction<
      (token: string) => Promise<FossSession | null>
    >;
    save: jest.MockedFunction<(session: FossSession) => Promise<FossSession>>;
  };
  let mockQrTokenService: {
    verifyToken: jest.MockedFunction<(token: string) => QrTokenPayload>;
  };
  let mockBookingVerificationService: {
    verifyStay: jest.MockedFunction<
      (bookingId: string, room: string) => Promise<BookingVerificationResultDto>
    >;
  };
  let mockConfigService: {
    get: jest.MockedFunction<(key: string) => string | null>;
  };
  let mockClock: Date;

  const validStay: BookingVerificationResultDto = {
    valid: true,
    bookingId: 'b-101',
    roomNumber: '101',
    status: 'CHECKED_IN',
    stayStart: new Date('2026-10-27T10:00:00Z').toISOString(),
    stayEnd: new Date('2026-10-30T10:00:00Z').toISOString(),
    guestName: 'Jane Doe',
    verifiedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockClock = new Date('2026-10-28T12:00:00Z');

    mockSessionRepository = {
      findByBookingId: jest
        .fn<() => Promise<FossSession | null>>()
        .mockResolvedValue(null),
      findActiveBySessionToken: jest
        .fn<() => Promise<FossSession | null>>()
        .mockResolvedValue(null),
      save: jest
        .fn<(session: FossSession) => Promise<FossSession>>()
        .mockImplementation(async (s) => s),
    };

    mockQrTokenService = {
      verifyToken: jest.fn<() => QrTokenPayload>().mockReturnValue({
        bookingId: 'b-101',
        roomNumber: '101',
        issuedAt: mockClock.getTime(),
        expiresAt: mockClock.getTime() + 3600000,
        nonce: 'nonce-123',
      }),
    };

    mockBookingVerificationService = {
      verifyStay: jest
        .fn<() => Promise<BookingVerificationResultDto>>()
        .mockResolvedValue(validStay),
    };

    mockConfigService = {
      get: jest
        .fn<(key: string) => string | null>()
        .mockImplementation((key) => {
          if (key === 'SESSION_TTL_HOURS') return '24';
          return null;
        }),
    };

    service = new GuestSessionsService(
      mockSessionRepository as unknown as FossSessionRepository,
      mockQrTokenService as unknown as QrTokenService,
      mockBookingVerificationService as unknown as BookingVerificationService,
      mockConfigService as unknown as ConfigService,
      () => mockClock,
    );
  });

  describe('authenticateWithQr', () => {
    it('creates a new session and stores hashed token at rest for new guest', async () => {
      const result = await service.authenticateWithQr('valid.qr.token');

      expect(mockQrTokenService.verifyToken).toHaveBeenCalledWith(
        'valid.qr.token',
      );
      expect(mockBookingVerificationService.verifyStay).toHaveBeenCalledWith(
        'b-101',
        '101',
      );
      expect(mockSessionRepository.findByBookingId).toHaveBeenCalledWith(
        'b-101',
      );
      expect(mockSessionRepository.save).toHaveBeenCalled();

      const savedSession = mockSessionRepository.save.mock.calls[0]![0];
      expect(savedSession.bookingId).toBe('b-101');
      expect(savedSession.roomNumber).toBe('101');
      expect(savedSession.isActive).toBe(true);
      expect(savedSession.sessionToken).toBe(
        service.hashToken(result.sessionToken),
      );

      expect(result.bookingId).toBe('b-101');
      expect(result.roomNumber).toBe('101');
      expect(result.guestName).toBe('Jane Doe');
      expect(result.active).toBe(true);
      expect(result.sessionToken).toBeDefined();
    });

    it('refreshes existing session for same bookingId to enforce uniqueness', async () => {
      const existingSession = new FossSession();
      existingSession.sessionId = 'existing-uuid';
      existingSession.bookingId = 'b-101';
      existingSession.roomNumber = '101';
      existingSession.sessionToken = 'old-token-hash';
      existingSession.isActive = false;

      mockSessionRepository.findByBookingId.mockResolvedValue(existingSession);

      const result = await service.authenticateWithQr('valid.qr.token');

      expect(result.sessionId).toBe('existing-uuid');
      expect(mockSessionRepository.save).toHaveBeenCalledWith(existingSession);
      expect(existingSession.isActive).toBe(true);
      expect(existingSession.sessionToken).not.toBe('old-token-hash');
    });

    it('throws BadRequestException for empty or missing qrToken', async () => {
      await expect(service.authenticateWithQr('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('bubbles up ForbiddenException when booking verification fails', async () => {
      mockBookingVerificationService.verifyStay.mockRejectedValue(
        new ForbiddenException('Booking is CHECKED_OUT'),
      );

      await expect(
        service.authenticateWithQr('valid.qr.token'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSessionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('validateSessionToken', () => {
    it('validates active session and confirms ongoing checked-in stay', async () => {
      const rawToken = 'test-token-12345';
      const hashedToken = service.hashToken(rawToken);

      const activeSession = new FossSession();
      activeSession.sessionId = 'session-1';
      activeSession.bookingId = 'b-101';
      activeSession.roomNumber = '101';
      activeSession.sessionToken = hashedToken;
      activeSession.isActive = true;
      activeSession.expiresAt = new Date('2026-10-29T12:00:00Z');

      mockSessionRepository.findActiveBySessionToken.mockImplementation(
        async (token) => (token === hashedToken ? activeSession : null),
      );

      const result = await service.validateSessionToken(rawToken);

      expect(result.session).toBe(activeSession);
      expect(result.stay).toBe(validStay);
      expect(mockBookingVerificationService.verifyStay).toHaveBeenCalledWith(
        'b-101',
        '101',
      );
    });

    it('supports backward-compatible lookup of unhashed tokens', async () => {
      const rawToken = 'unhashed-legacy-token';
      const activeSession = new FossSession();
      activeSession.sessionId = 'session-legacy';
      activeSession.bookingId = 'b-101';
      activeSession.roomNumber = '101';
      activeSession.sessionToken = rawToken;
      activeSession.isActive = true;
      activeSession.expiresAt = new Date('2026-10-29T12:00:00Z');

      mockSessionRepository.findActiveBySessionToken.mockImplementation(
        async (token) => (token === rawToken ? activeSession : null),
      );

      const result = await service.validateSessionToken(rawToken);
      expect(result.session).toBe(activeSession);
    });

    it('throws UnauthorizedException when token is missing or empty', async () => {
      await expect(service.validateSessionToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when session is not found or inactive', async () => {
      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(null);

      await expect(
        service.validateSessionToken('non-existent-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('marks session inactive and throws when session has expired', async () => {
      const rawToken = 'expired-token';
      const hashedToken = service.hashToken(rawToken);

      const expiredSession = new FossSession();
      expiredSession.sessionId = 'session-expired';
      expiredSession.bookingId = 'b-101';
      expiredSession.roomNumber = '101';
      expiredSession.sessionToken = hashedToken;
      expiredSession.isActive = true;
      expiredSession.expiresAt = new Date('2026-10-27T12:00:00Z'); // Expired yesterday

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(
        expiredSession,
      );

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(expiredSession.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(expiredSession);
    });

    it('revokes session when stay verification indicates checkout occurred', async () => {
      const rawToken = 'active-token';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'session-checked-out';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date('2026-10-29T12:00:00Z');

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockRejectedValue(
        new ForbiddenException('Booking is CHECKED_OUT'),
      );

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
    });
  });

  describe('logout', () => {
    it('marks active session inactive on logout', async () => {
      const rawToken = 'token-to-logout';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'session-active';
      session.sessionToken = hashedToken;
      session.isActive = true;

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);

      const result = await service.logout(rawToken);

      expect(result.success).toBe(true);
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
    });

    it('throws UnauthorizedException when token is missing on logout', async () => {
      await expect(service.logout('')).rejects.toThrow(UnauthorizedException);
    });

    it('returns success even if session is already inactive or not found', async () => {
      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(null);

      const result = await service.logout('unknown-token');
      expect(result.success).toBe(true);
    });
  });
});
