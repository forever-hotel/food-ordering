import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

import { GuestSessionResponseDto } from './dto/guest-session-response.dto.js';
import { IssueQrDto, IssueQrResponseDto } from './dto/issue-qr.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import type { GuestContext } from './interfaces/guest-context.interface.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
import { QrActivationService } from './services/qr-activation.service.js';
import { QrTokenService } from './services/qr-token.service.js';

describe('GuestSessionsController', () => {
  let controller: GuestSessionsController;
  let mockGuestSessionsService: {
    authenticateWithQr: jest.MockedFunction<
      (token: string) => Promise<GuestSessionResponseDto>
    >;
    logout: jest.MockedFunction<
      (token: string) => Promise<{ success: boolean; message: string }>
    >;
    handleFdsCheckoutEvent: jest.MockedFunction<(event: any) => Promise<any>>;
    handleFdsRoomReassignEvent: jest.MockedFunction<
      (event: any) => Promise<any>
    >;
    getProcessedEvent: jest.MockedFunction<(eventId: string) => any>;
  };
  let mockQrTokenService: {
    getDemoTokens: jest.MockedFunction<() => Record<string, string>>;
    reset: jest.MockedFunction<() => void>;
  };
  let mockQrActivationService: {
    issueActivationCredential: jest.MockedFunction<
      (dto: IssueQrDto) => Promise<IssueQrResponseDto>
    >;
    redeemActivationCredential: jest.MockedFunction<
      (token: string) => Promise<GuestSessionResponseDto>
    >;
    revokeBookingActivations: jest.MockedFunction<
      (bookingId: string) => Promise<number>
    >;
  };
  let mockConfigService: {
    get: jest.MockedFunction<(key: string) => any>;
  };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn<(key: string) => any>().mockReturnValue(null),
    };

    mockGuestSessionsService = {
      authenticateWithQr: jest.fn<() => Promise<GuestSessionResponseDto>>(),
      logout: jest.fn<() => Promise<{ success: boolean; message: string }>>(),
      handleFdsCheckoutEvent: jest.fn<() => Promise<any>>(),
      handleFdsRoomReassignEvent: jest.fn<() => Promise<any>>(),
      getProcessedEvent: jest.fn<() => any>(),
    };

    mockQrTokenService = {
      getDemoTokens: jest.fn<() => Record<string, string>>().mockReturnValue({
        '101-checked-in': 'demo-qr-token-101',
      }),
      reset: jest.fn<() => void>(),
      resetDemoNonces: jest.fn<() => number>().mockReturnValue(5),
    };

    mockQrActivationService = {
      issueActivationCredential: jest.fn<() => Promise<IssueQrResponseDto>>(),
      redeemActivationCredential:
        jest.fn<() => Promise<GuestSessionResponseDto>>(),
      revokeBookingActivations: jest.fn<() => Promise<number>>(),
    };

    process.env.NODE_ENV = 'test';
    process.env.DEMO_MODE = 'true';

    controller = new GuestSessionsController(
      mockGuestSessionsService as unknown as GuestSessionsService,
      mockQrTokenService as unknown as QrTokenService,
      mockQrActivationService as unknown as QrActivationService,
      mockConfigService as any,
    );
  });

  describe('issueGuestQrSlip', () => {
    it('delegates QR issuance to QrActivationService', async () => {
      const issueDto: IssueQrDto = {
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        checkOutDate: '2026-11-02T11:00:00Z',
      };

      const expectedResponse: IssueQrResponseDto = {
        status: 'ACTIVATED',
        sessionReference: 'act-uuid',
        activationUrl:
          'https://guest.foreverhotel.com/activate?token=token-123',
        qrToken: 'token-123',
        expiresAt: '2026-10-31T16:15:00Z',
        validUntilDate: '2026-11-02T11:00:00Z',
      };

      mockQrActivationService.issueActivationCredential.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.issueGuestQrSlip(issueDto);
      expect(
        mockQrActivationService.issueActivationCredential,
      ).toHaveBeenCalledWith(issueDto);
      expect(result).toEqual(expectedResponse);
    });

    it('works via issueGuestQrSlipAlias', async () => {
      const issueDto: IssueQrDto = {
        bookingReference: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      };

      const expectedResponse: IssueQrResponseDto = {
        status: 'ACTIVATED',
        sessionReference: 'act-uuid',
        activationUrl:
          'https://guest.foreverhotel.com/activate?token=token-123',
        qrToken: 'token-123',
        expiresAt: '2026-10-31T16:15:00Z',
        validUntilDate: '2026-11-02T11:00:00Z',
      };

      mockQrActivationService.issueActivationCredential.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.issueGuestQrSlipAlias(issueDto);
      expect(
        mockQrActivationService.issueActivationCredential,
      ).toHaveBeenCalledWith(issueDto);
      expect(result).toEqual(expectedResponse);
    });

    it('rejects empty body', async () => {
      await expect(controller.issueGuestQrSlip(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('authenticateWithQr', () => {
    it('routes opaque single-use activation credentials (no dot) to QrActivationService', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const body: VerifyQrDto = {
        qrToken: 'opaque-base64url-token-without-dots',
      };
      const result = await controller.authenticateWithQr(body);

      expect(
        mockQrActivationService.redeemActivationCredential,
      ).toHaveBeenCalledWith('opaque-base64url-token-without-dots');
      expect(
        mockGuestSessionsService.authenticateWithQr,
      ).not.toHaveBeenCalled();
      const { sessionToken: _sessionToken, ...expectedSanitized } = responseDto;
      expect(result).toEqual(expectedSanitized);
      expect((result as any).sessionToken).toBeUndefined();
    });

    it('1. regression test: omits sessionToken when request has no Origin, Referer, or client headers', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-no-headers',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-sensitive-bearer-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = { headers: {} } as any; // No Origin, Referer, or client headers

      const body: VerifyQrDto = { qrToken: 'opaque-activation-token' };
      const result = await controller.authenticateWithQr(
        body,
        mockReq,
        mockRes,
      );

      // Must never return raw session token to public callers with no browser headers
      expect((result as any).sessionToken).toBeUndefined();
      expect(result.sessionId).toBe('sess-no-headers');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'raw-sensitive-bearer-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it('2. regression test: rejects credential disclosure when spoofed internal headers are passed', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-spoofed-headers',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-sensitive-bearer-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = {
        headers: {
          'x-preserve-bearer-token': 'true',
          'x-internal-service-key': 'attacker-unauthorized-key',
          'x-fds-signature': 'forged-signature',
        },
      } as any;

      const body: VerifyQrDto = { qrToken: 'opaque-activation-token' };
      const result = await controller.authenticateWithQr(
        body,
        mockReq,
        mockRes,
      );

      // Raw sessionToken must NEVER be exposed in JSON response regardless of spoofed headers
      expect((result as any).sessionToken).toBeUndefined();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'raw-sensitive-bearer-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('3. regression test: omits sessionToken when ordinary browser headers are passed', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-browser-headers',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-sensitive-bearer-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = {
        headers: {
          'x-foss-client': 'foss-web',
          origin: 'https://hotel.example.com',
          referer: 'https://hotel.example.com/qr-scan',
        },
      } as any;

      const body: VerifyQrDto = { qrToken: 'opaque-activation-token' };
      const result = await controller.authenticateWithQr(
        body,
        mockReq,
        mockRes,
      );

      expect((result as any).sessionToken).toBeUndefined();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'raw-sensitive-bearer-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('4. regression test: valid QR activation credentials establish session via HttpOnly cookie with checkout-bound maxAge', async () => {
      const futureStayEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-valid-stay',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-sensitive-bearer-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: futureStayEnd,
        expiresAt: futureStayEnd,
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = { headers: {} } as any;

      const body: VerifyQrDto = { qrToken: 'valid-qr-token' };
      const result = await controller.authenticateWithQr(
        body,
        mockReq,
        mockRes,
      );

      expect(result.active).toBe(true);
      expect(result.bookingId).toBe('book-1');
      expect(result.roomNumber).toBe('101');
      expect((result as any).sessionToken).toBeUndefined();

      // Cookie maxAge must match checkout-bound duration without arbitrary 24h cap
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'raw-sensitive-bearer-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          maxAge: expect.any(Number),
        }),
      );
      const callArgs = mockRes.cookie.mock.calls[0];
      const actualMaxAge = callArgs[2].maxAge;
      const expectedDuration = new Date(futureStayEnd).getTime() - Date.now();
      expect(Math.abs(actualMaxAge - expectedDuration)).toBeLessThan(5000);
      expect(actualMaxAge).toBeGreaterThan(2 * 24 * 60 * 60 * 1000); // multi-day preserved!
    });

    it('5. regression test: rejects attempt to redeem an already-used QR with ConflictException', async () => {
      mockQrActivationService.redeemActivationCredential.mockRejectedValue(
        new ConflictException('This QR activation code has already been used.'),
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = { headers: {} } as any;

      const body: VerifyQrDto = { qrToken: 'replayed-qr-token' };
      await expect(
        controller.authenticateWithQr(body, mockReq, mockRes),
      ).rejects.toThrow(ConflictException);

      expect(mockRes.cookie).not.toHaveBeenCalled();
    });

    it('6. regression test: response body contains no raw session token in every public case', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-matrix-test',
        bookingId: 'book-matrix',
        roomNumber: '202',
        sessionToken: 'secret-token-12345',
        guestName: 'Alice',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-30T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const testCases = [
        {},
        { 'x-foss-client': 'foss-web' },
        { origin: 'https://hotel.example.com' },
        { referer: 'https://hotel.example.com/qr' },
        { 'user-agent': 'curl/7.88.1' },
        { 'x-custom-header': 'value' },
        { 'x-preserve-bearer-token': 'true' },
        { 'x-internal-service-key': 'invalid-key' },
      ];

      for (const headers of testCases) {
        const mockRes = { cookie: jest.fn() } as any;
        const mockReq = { headers } as any;
        const result = await controller.authenticateWithQr(
          { qrToken: 'token' },
          mockReq,
          mockRes,
        );
        expect((result as any).sessionToken).toBeUndefined();
      }
    });

    it('7. preserves sessionToken for cryptographically verified internal service callers', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-internal-caller',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-sensitive-bearer-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockQrActivationService.redeemActivationCredential.mockResolvedValue(
        responseDto,
      );

      const mockRes = { cookie: jest.fn() } as any;
      const mockReq = {
        headers: {
          'x-internal-service-key': 'valid-configured-internal-key',
        },
      } as any;

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'INTERNAL_SERVICE_KEY') return 'valid-configured-internal-key';
        return null;
      });

      const body: VerifyQrDto = { qrToken: 'opaque-activation-token' };
      const result = await controller.authenticateWithQr(
        body,
        mockReq,
        mockRes,
      );

      // Verified internal caller retains sessionToken according to verified internal contract
      expect(result.sessionToken).toBe('raw-sensitive-bearer-token');
    });

    it('routes signed development fixture tokens (with dot) to GuestSessionsService', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-28T10:00:00Z',
        createdAt: '2026-10-27T10:00:00Z',
        active: true,
      };

      mockGuestSessionsService.authenticateWithQr.mockResolvedValue(
        responseDto,
      );

      const body: VerifyQrDto = { qrToken: 'encoded-payload.valid-signature' };
      const result = await controller.authenticateWithQr(body);

      expect(mockGuestSessionsService.authenticateWithQr).toHaveBeenCalledWith(
        'encoded-payload.valid-signature',
      );
      expect(
        mockQrActivationService.redeemActivationCredential,
      ).not.toHaveBeenCalled();
      const { sessionToken: _sessionToken, ...expectedSanitized } = responseDto;
      expect(result).toEqual(expectedSanitized);
      expect((result as any).sessionToken).toBeUndefined();
    });

    it('rejects request with missing or empty qrToken', async () => {
      await expect(
        controller.authenticateWithQr({ qrToken: '' } as VerifyQrDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('production safety: unconditionally rejects signed development tokens with 401 in production', async () => {
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          controller.authenticateWithQr({
            qrToken: 'header.payload.signature',
          }),
        ).rejects.toThrow(UnauthorizedException);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    it('production safety: rejects signed tokens even if ALLOW_LEGACY_QR_TOKENS=true override is set (no backdoor)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_LEGACY_QR_TOKENS = 'true';
      try {
        await expect(
          controller.authenticateWithQr({
            qrToken: 'header.payload.signature',
          }),
        ).rejects.toThrow(UnauthorizedException);
      } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.ALLOW_LEGACY_QR_TOKENS;
      }
    });

    it('production safety: fails securely with ServiceUnavailableException when qrActivationService is missing', async () => {
      const controllerWithoutActivation = new GuestSessionsController(
        mockGuestSessionsService as unknown as GuestSessionsService,
        mockQrTokenService as unknown as QrTokenService,
        undefined,
      );

      await expect(
        controllerWithoutActivation.authenticateWithQr({
          qrToken: 'opaque-activation-token-no-dot',
        }),
      ).rejects.toThrow('QR activation service is unconfigured.');
    });
  });

  describe('getMe', () => {
    it('returns current guest context with active: true', () => {
      const guestContext: GuestContext = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
      };

      const result = controller.getMe(guestContext);
      expect(result).toEqual({ ...guestContext, active: true });
    });

    it('updates session cookie maxAge to reflect extended stay checkout boundary when getMe is accessed', () => {
      const guestContext: GuestContext = {
        sessionId: 'sess-extended-1',
        bookingId: 'book-1',
        roomNumber: '101',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-11-05T11:00:00Z',
      };

      const extendedExpiresAt = new Date('2026-11-05T11:00:00Z');
      const req = {
        sessionToken: 'valid-session-token',
        sessionRecord: { expiresAt: extendedExpiresAt },
        authSource: 'cookie',
      } as any;
      const res = { cookie: jest.fn() } as any;

      const result = controller.getMe(guestContext, req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'valid-session-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(result.expiresAt).toBe(extendedExpiresAt.toISOString());
      // Raw bearer token must not be in the JSON payload for cookie callers
      expect(result.sessionToken).toBeUndefined();
    });
  });

  describe('verifyRoomAccess', () => {
    it('returns authorized payload for matching room', () => {
      const guestContext: GuestContext = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
      };

      const result = controller.verifyRoomAccess('101', guestContext);
      expect(result).toEqual({
        authorized: true,
        roomNumber: '101',
        sessionId: 'sess-1',
      });
    });
  });

  describe('verifyBookingAccess', () => {
    it('returns authorized payload for matching booking', () => {
      const guestContext: GuestContext = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
      };

      const result = controller.verifyBookingAccess('book-1', guestContext);
      expect(result).toEqual({
        authorized: true,
        bookingId: 'book-1',
        sessionId: 'sess-1',
      });
    });
  });

  describe('logout', () => {
    it('logs out guest session successfully and clears session cookie', async () => {
      mockGuestSessionsService.logout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully.',
      });

      const req = { sessionToken: 'bearer-token-123' } as any;
      const res = {
        clearCookie: jest.fn(),
      } as any;
      const result = await controller.logout(req, res);
      expect(mockGuestSessionsService.logout).toHaveBeenCalledWith(
        'bearer-token-123',
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'foss_guest_session',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('renewSession', () => {
    it('renews active guest session and updates session cookie', async () => {
      const renewedDto: GuestSessionResponseDto = {
        sessionId: 'sess-renewed-123',
        bookingId: 'b-101',
        roomNumber: '101',
        sessionToken: 'renewed-token-xyz',
        guestName: 'Jane Smith',
        active: true,
        expiresAt: '2026-11-05T12:00:00.000Z',
      };

      mockGuestSessionsService.renewSession = jest
        .fn<() => Promise<GuestSessionResponseDto>>()
        .mockResolvedValue(renewedDto);

      const req = { sessionToken: 'current-session-token' } as any;
      const res = {
        cookie: jest.fn(),
      } as any;

      const result = await controller.renewSession(req, res);

      expect(mockGuestSessionsService.renewSession).toHaveBeenCalledWith(
        'current-session-token',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'foss_guest_session',
        'renewed-token-xyz',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      const expectedResult = { ...renewedDto };
      delete (expectedResult as any).sessionToken;
      expect(result).toEqual(expectedResult);
    });

    it('preserves sessionToken in renewSession when caller was verified via explicit Bearer authorization header', async () => {
      const renewedDto: GuestSessionResponseDto = {
        sessionId: 'sess-renewed-123',
        sessionToken: 'renewed-token-xyz',
        bookingId: 'b-101',
        roomNumber: '101',
        guestName: 'Jane Smith',
        active: true,
        expiresAt: '2026-11-05T12:00:00.000Z',
      };

      mockGuestSessionsService.renewSession = jest
        .fn<() => Promise<GuestSessionResponseDto>>()
        .mockResolvedValue(renewedDto);

      const req = {
        sessionToken: 'current-session-token',
        authSource: 'bearer',
      } as any;
      const res = { cookie: jest.fn() } as any;

      const result = await controller.renewSession(req, res);
      expect(result.sessionToken).toBe('renewed-token-xyz');
    });

    it('security audit: renewSession strictly omits sessionToken for cookie callers even if spoofed internal headers are present', async () => {
      const renewedDto: GuestSessionResponseDto = {
        sessionId: 'sess-renewed-123',
        sessionToken: 'renewed-token-xyz',
        bookingId: 'b-101',
        roomNumber: '101',
        guestName: 'Jane Smith',
        active: true,
        expiresAt: '2026-11-05T12:00:00.000Z',
      };

      mockGuestSessionsService.renewSession = jest
        .fn<() => Promise<GuestSessionResponseDto>>()
        .mockResolvedValue(renewedDto);

      const req = {
        sessionToken: 'current-session-token',
        authSource: 'cookie',
        headers: {
          'x-preserve-bearer-token': 'true',
          'x-internal-service-key': 'malicious-key',
        },
      } as any;
      const res = { cookie: jest.fn() } as any;

      const result = await controller.renewSession(req, res);
      expect((result as any).sessionToken).toBeUndefined();
      expect(result.sessionId).toBe('sess-renewed-123');
    });
  });

  describe('Retired Demo Utility Endpoints (#101)', () => {
    it('confirms getDemoTokens endpoint is retired and not defined on controller', () => {
      expect((controller as any).getDemoTokens).toBeUndefined();
    });

    it('confirms resetDemoState endpoint is retired and not defined on controller', () => {
      expect((controller as any).resetDemoState).toBeUndefined();
    });

    it('confirms guest QR activation does not require or depend on DEV_DEMO_KEY', async () => {
      delete process.env.DEV_DEMO_KEY;

      const mockResponse: GuestSessionResponseDto = {
        sessionId: 'sess-123',
        sessionToken: 'jwt-guest-token',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        guestName: 'John Doe',
        active: true,
        expiresAt: '2026-11-04T12:00:00.000Z',
      };

      mockGuestSessionsService.authenticateWithQr.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.authenticateWithQr({
        qrToken: 'header.payload.signature',
      });

      const { sessionToken: _sessionToken, ...expectedSanitized } = mockResponse;
      expect(result).toEqual(expectedSanitized);
      expect((result as any).sessionToken).toBeUndefined();
      expect(mockGuestSessionsService.authenticateWithQr).toHaveBeenCalledWith(
        'header.payload.signature',
      );
    });

    it('confirms x-developer-key and x-demo-admin-key headers are not required for guest authentication', async () => {
      delete process.env.DEV_DEMO_KEY;

      const mockResponse: GuestSessionResponseDto = {
        sessionId: 'sess-123',
        sessionToken: 'jwt-guest-token',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        guestName: 'John Doe',
        active: true,
        expiresAt: '2026-11-04T12:00:00.000Z',
      };

      mockGuestSessionsService.authenticateWithQr.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.authenticateWithQr({
        qrToken: 'valid.signed.token',
      });

      expect((result as any).sessionToken).toBeUndefined();
      expect(result.roomNumber).toBe('101');
    });
  });

  describe('handleCheckoutEvent', () => {
    it('delegates checkout event to guestSessionsService', async () => {
      const checkoutEvent = {
        eventId: 'evt-1',
        bookingId: 'book-1',
        roomNumber: '101',
      };

      mockGuestSessionsService.handleFdsCheckoutEvent.mockResolvedValue({
        success: true,
        processed: true,
        bookingId: 'book-1',
        sessionRevoked: true,
      });

      const result = await controller.handleCheckoutEvent(checkoutEvent as any);
      expect(
        mockGuestSessionsService.handleFdsCheckoutEvent,
      ).toHaveBeenCalledWith(checkoutEvent);
      expect(result.sessionRevoked).toBe(true);
    });

    it('rejects checkout event when eventId or bookingId is missing', async () => {
      await expect(
        controller.handleCheckoutEvent({
          eventId: 'evt-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleRoomReassignEvent', () => {
    it('delegates room reassign event to guestSessionsService', async () => {
      const reassignEvent = {
        eventId: 'evt-1',
        bookingId: 'book-1',
        previousRoomNumber: '101',
        newRoomNumber: '102',
      };

      mockGuestSessionsService.handleFdsRoomReassignEvent.mockResolvedValue({
        success: true,
        processed: true,
        bookingId: 'book-1',
        sessionRevoked: true,
      });

      const result = await controller.handleRoomReassignEvent(reassignEvent);
      expect(
        mockGuestSessionsService.handleFdsRoomReassignEvent,
      ).toHaveBeenCalledWith(reassignEvent);
      expect(result.sessionRevoked).toBe(true);
    });

    it('rejects room reassign event when required fields are missing', async () => {
      await expect(
        controller.handleRoomReassignEvent({
          eventId: 'evt-1',
          bookingId: 'book-1',
          previousRoomNumber: '101',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProcessedEvent', () => {
    it('delegates event lookup to guestSessionsService', () => {
      mockGuestSessionsService.getProcessedEvent.mockReturnValue({
        processed: true,
        event: { eventType: 'fds.guest.checkout' },
      });

      const result = controller.getProcessedEvent('evt-1');
      expect(mockGuestSessionsService.getProcessedEvent).toHaveBeenCalledWith(
        'evt-1',
      );
      expect(result.processed).toBe(true);
    });
  });
});
