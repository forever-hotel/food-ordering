import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BookingVerificationResultDto } from '../../../integrations/internal-services/booking/dto/booking-verification-result.dto.js';
import { BookingVerificationService } from '../../../integrations/internal-services/booking/booking-verification.service.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { FossSessionRepository } from '../repositories/foss-session.repository.js';
import { GuestSessionsService } from './guest-sessions.service.js';
import { QrActivationService } from './qr-activation.service.js';
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
  let mockQrActivationService: {
    revokeBookingActivations: jest.MockedFunction<
      (bookingId: string) => Promise<number>
    >;
  };
  let mockBookingVerificationService: {
    verifyStay: jest.MockedFunction<
      (bookingId: string, room: string) => Promise<BookingVerificationResultDto>
    >;
    simulateCheckout: jest.MockedFunction<
      (bookingId: string) => Promise<boolean>
    >;
    simulateRoomReassign: jest.MockedFunction<
      (bookingId: string, newRoom: string) => Promise<boolean>
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

    mockQrActivationService = {
      revokeBookingActivations: jest
        .fn<(bookingId: string) => Promise<number>>()
        .mockResolvedValue(0),
      handleRoomReassignment: jest
        .fn<
          (bookingId: string, oldRoom: string, newRoom: string) => Promise<void>
        >()
        .mockResolvedValue(undefined),
    };

    mockBookingVerificationService = {
      verifyStay: jest
        .fn<() => Promise<BookingVerificationResultDto>>()
        .mockResolvedValue(validStay),
      simulateCheckout: jest
        .fn<(bookingId: string) => Promise<boolean>>()
        .mockResolvedValue(true),
      simulateRoomReassign: jest
        .fn<(bookingId: string, newRoom: string) => Promise<boolean>>()
        .mockResolvedValue(true),
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
      mockQrActivationService as unknown as QrActivationService,
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

    it('enforces 24-hour expiry for 1-day booking checked in at 3 PM (Test 1)', async () => {
      mockClock = new Date('2026-11-10T15:00:00.000Z');
      const stay3pm: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd: '2026-11-11T15:00:00.000Z',
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(stay3pm);

      const result = await service.authenticateWithQr('valid.qr.token');

      expect(result.stayStart).toBe('2026-11-10T15:00:00.000Z');
      expect(result.stayEnd).toBe('2026-11-11T15:00:00.000Z');
      expect(result.expiresAt).toBe('2026-11-11T15:00:00.000Z');
    });

    it('enforces 24-hour expiry for 1-day booking checked in at 11 PM (Test 2)', async () => {
      mockClock = new Date('2026-11-10T23:00:00.000Z');
      const stay11pm: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-10T23:00:00.000Z',
        stayEnd: '2026-11-11T23:00:00.000Z',
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(stay11pm);

      const result = await service.authenticateWithQr('valid.qr.token');

      expect(result.stayStart).toBe('2026-11-10T23:00:00.000Z');
      expect(result.stayEnd).toBe('2026-11-11T23:00:00.000Z');
      expect(result.expiresAt).toBe('2026-11-11T23:00:00.000Z');
    });

    it('bounds session for 2-day booking expiring 48h after check-in by configured session TTL (Test 3)', async () => {
      mockClock = new Date('2026-11-10T15:00:00.000Z');
      const stay2Days: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd: '2026-11-12T15:00:00.000Z', // 48h stay
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(stay2Days);

      const result = await service.authenticateWithQr('valid.qr.token');

      // Security TTL is 24 hours, so expiresAt is now + 24h, not now + 48h
      expect(result.expiresAt).toBe('2026-11-11T15:00:00.000Z');
      expect(result.stayEnd).toBe('2026-11-12T15:00:00.000Z');
    });

    it('bounds session expiry to stayEnd when stayEnd is shorter than session TTL (Test 9)', async () => {
      mockClock = new Date('2026-11-10T15:00:00.000Z');
      const shortStay: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-10T11:00:00.000Z',
        stayEnd: '2026-11-10T19:00:00.000Z', // Only 4 hours remaining
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(shortStay);

      const result = await service.authenticateWithQr('valid.qr.token');

      expect(result.expiresAt).toBe('2026-11-10T19:00:00.000Z');
    });

    it('rejects session creation when stayEnd is earlier than or equal to stayStart (Test 8)', async () => {
      mockClock = new Date('2026-11-10T15:00:00.000Z');
      const invertedStay: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-11T15:00:00.000Z',
        stayEnd: '2026-11-10T15:00:00.000Z', // Inverted!
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(invertedStay);

      await expect(
        service.authenticateWithQr('valid.qr.token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects session creation with ForbiddenException when stay has already expired', async () => {
      mockClock = new Date('2026-11-11T16:00:00.000Z');
      const expiredStay: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd: '2026-11-11T15:00:00.000Z', // Expired 1 hour ago
      };
      mockBookingVerificationService.verifyStay.mockResolvedValue(expiredStay);

      await expect(
        service.authenticateWithQr('valid.qr.token'),
      ).rejects.toThrow(ForbiddenException);
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

    it('permits valid access immediately before stay expiry (Test 4)', async () => {
      const stayEnd = '2026-11-11T15:00:00.000Z';
      // 1 second before expiry
      mockClock = new Date('2026-11-11T14:59:59.000Z');

      const rawToken = 'active-token-before-expiry';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-valid-before';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date(stayEnd);

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd,
      });

      const result = await service.validateSessionToken(rawToken);
      expect(result.session).toBe(session);
      expect(result.stay.stayEnd).toBe(stayEnd);
    });

    it('rejects access at the exact expiry timestamp (Test 5)', async () => {
      const stayEnd = '2026-11-11T15:00:00.000Z';
      // Exactly at expiry
      mockClock = new Date('2026-11-11T15:00:00.000Z');

      const rawToken = 'token-at-exact-expiry';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-exact-expiry';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date('2026-11-11T16:00:00.000Z'); // Session was issued with later expiry

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd,
      });

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
    });

    it('rejects access after stay expiry has passed (Test 6)', async () => {
      const stayEnd = '2026-11-11T15:00:00.000Z';
      // 10 minutes after expiry
      mockClock = new Date('2026-11-11T15:10:00.000Z');

      const rawToken = 'token-after-expiry';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-after-expiry';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date('2026-11-11T16:00:00.000Z');

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd,
      });

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
    });

    it('rejects access when FDS returns malformed or invalid stay timestamps (Test 7)', async () => {
      const rawToken = 'token-malformed-stay';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-malformed';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date('2026-11-11T15:00:00.000Z');

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: 'invalid-start-date',
        stayEnd: 'invalid-end-date',
      });

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('dynamically shortens session expiresAt when authoritative FDS stay is shortened (Test 10)', async () => {
      mockClock = new Date('2026-11-10T16:00:00.000Z');

      const rawToken = 'token-shortened-stay';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-shortened';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      // Originally expires in 24 hours (Nov 11, 15:00)
      session.expiresAt = new Date('2026-11-11T15:00:00.000Z');

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);

      // FDS returns shortened stayEnd (today at 18:00)
      const shortenedStayEnd = '2026-11-10T18:00:00.000Z';
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd: shortenedStayEnd,
      });

      const result = await service.validateSessionToken(rawToken);

      expect(result.session.expiresAt.toISOString()).toBe(shortenedStayEnd);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
    });

    it('does not extend session beyond configured security TTL when stay is extended (Test 11)', async () => {
      mockClock = new Date('2026-11-10T16:00:00.000Z');

      const rawToken = 'token-extended-stay';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-extended';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      // Security TTL set expiresAt to Nov 11, 15:00 (24 hours from check-in)
      const originalExpiresAt = new Date('2026-11-11T15:00:00.000Z');
      session.expiresAt = originalExpiresAt;

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);

      // Stay is extended by 5 days
      mockBookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-10T15:00:00.000Z',
        stayEnd: '2026-11-16T15:00:00.000Z', // 5 days later
      });

      const result = await service.validateSessionToken(rawToken);

      // Session expiresAt must NOT be expanded to Nov 16; it remains bounded by configured TTL
      expect(result.session.expiresAt).toEqual(originalExpiresAt);
      // No unnecessary database write on valid request
      expect(mockSessionRepository.save).not.toHaveBeenCalled();
    });

    it('bubbles up ServiceUnavailableException on FDS outage without revoking session (Test 14)', async () => {
      const rawToken = 'token-outage';
      const hashedToken = service.hashToken(rawToken);

      const session = new FossSession();
      session.sessionId = 'sess-outage';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.sessionToken = hashedToken;
      session.isActive = true;
      session.expiresAt = new Date('2026-11-11T15:00:00.000Z');

      mockSessionRepository.findActiveBySessionToken.mockResolvedValue(session);
      mockBookingVerificationService.verifyStay.mockRejectedValue(
        new ServiceUnavailableException('FDS unavailable'),
      );

      await expect(service.validateSessionToken(rawToken)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // Crucial: session must NOT be permanently revoked!
      expect(session.isActive).toBe(true);
      expect(mockSessionRepository.save).not.toHaveBeenCalled();
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

  describe('handleFdsCheckoutEvent', () => {
    it('revokes active session upon receiving valid FDS checkout event (AC1)', async () => {
      const session = new FossSession();
      session.sessionId = 'sess-checkout-test';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.isActive = true;
      session.expiresAt = new Date('2026-10-30T10:00:00Z');

      mockSessionRepository.findByBookingId.mockResolvedValue(session);

      const result = await service.handleFdsCheckoutEvent({
        eventId: 'evt-checkout-100',
        eventType: 'fds.guest.checkout',
        bookingId: 'b-101',
        roomNumber: '101',
        checkoutTime: '2026-10-28T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(result.sessionRevoked).toBe(true);
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
      expect(
        mockBookingVerificationService.simulateCheckout,
      ).toHaveBeenCalledWith('b-101');
    });

    it('processes duplicate checkout event idempotently without re-execution (AC2)', async () => {
      const session = new FossSession();
      session.sessionId = 'sess-dup-test';
      session.bookingId = 'b-101';
      session.isActive = true;
      session.expiresAt = new Date('2026-10-30T10:00:00Z');

      mockSessionRepository.findByBookingId.mockResolvedValue(session);

      const event = {
        eventId: 'evt-checkout-dup',
        eventType: 'fds.guest.checkout' as const,
        bookingId: 'b-101',
        roomNumber: '101',
        checkoutTime: '2026-10-28T12:00:00Z',
      };

      const firstCall = await service.handleFdsCheckoutEvent(event);
      expect(firstCall.processed).toBe(true);
      expect(firstCall.duplicate).toBeUndefined();

      // Second call with same eventId
      const secondCall = await service.handleFdsCheckoutEvent(event);
      expect(secondCall.duplicate).toBe(true);
      expect(secondCall.message).toContain('idempotently');
    });

    it('handles checkout event when no active session exists', async () => {
      mockSessionRepository.findByBookingId.mockResolvedValue(null);

      const result = await service.handleFdsCheckoutEvent({
        eventId: 'evt-no-session',
        eventType: 'fds.guest.checkout',
        bookingId: 'b-999',
        roomNumber: '999',
        checkoutTime: '2026-10-28T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.sessionRevoked).toBe(false);
    });

    it('throws BadRequestException when event or required fields are missing', async () => {
      await expect(service.handleFdsCheckoutEvent(null as any)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.handleFdsCheckoutEvent({ eventId: '', bookingId: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleFdsRoomReassignEvent', () => {
    it('invalidates previous room session upon room reassignment event (AC1)', async () => {
      const session = new FossSession();
      session.sessionId = 'sess-reassign-test';
      session.bookingId = 'b-101';
      session.roomNumber = '101';
      session.isActive = true;

      mockSessionRepository.findByBookingId.mockResolvedValue(session);

      const result = await service.handleFdsRoomReassignEvent({
        eventId: 'evt-reassign-100',
        eventType: 'fds.room.reassigned',
        bookingId: 'b-101',
        previousRoomNumber: '101',
        newRoomNumber: '105',
        reassignedAt: '2026-10-28T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.sessionRevoked).toBe(true);
      expect(session.isActive).toBe(false);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(session);
      expect(
        mockBookingVerificationService.simulateRoomReassign,
      ).toHaveBeenCalledWith('b-101', '105');
    });

    it('processes duplicate room reassignment event idempotently (AC2)', async () => {
      mockSessionRepository.findByBookingId.mockResolvedValue(null);

      const event = {
        eventId: 'evt-reassign-dup',
        eventType: 'fds.room.reassigned' as const,
        bookingId: 'b-101',
        previousRoomNumber: '101',
        newRoomNumber: '105',
        reassignedAt: '2026-10-28T12:00:00Z',
      };

      await service.handleFdsRoomReassignEvent(event);
      const secondCall = await service.handleFdsRoomReassignEvent(event);

      expect(secondCall.duplicate).toBe(true);
    });

    it('throws BadRequestException when room reassignment fields are missing', async () => {
      await expect(
        service.handleFdsRoomReassignEvent({ eventId: 'evt-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProcessedEvent', () => {
    it('returns processed event info when found', async () => {
      const event = {
        eventId: 'evt-lookup-test',
        eventType: 'fds.guest.checkout' as const,
        bookingId: 'b-101',
        roomNumber: '101',
        checkoutTime: '2026-10-28T12:00:00Z',
      };

      await service.handleFdsCheckoutEvent(event);

      const lookup = service.getProcessedEvent('evt-lookup-test');
      expect(lookup.processed).toBe(true);
      expect(lookup.event?.eventType).toBe('fds.guest.checkout');
    });

    it('returns { processed: false } when event is not found', () => {
      const lookup = service.getProcessedEvent('non-existent-evt');
      expect(lookup.processed).toBe(false);
    });

    it('throws BadRequestException when eventId is empty', () => {
      expect(() => service.getProcessedEvent('')).toThrow(BadRequestException);
    });
  });
});
