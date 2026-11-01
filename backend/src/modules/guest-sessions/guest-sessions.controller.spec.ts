import { jest } from '@jest/globals';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

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
  let mockDemoOrderRepository: {
    reset: jest.MockedFunction<() => void>;
  };
  let mockRealtimeService: {
    clearAll: jest.MockedFunction<() => void>;
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

  beforeEach(() => {
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
    };

    mockDemoOrderRepository = {
      reset: jest.fn<() => void>(),
    };

    mockRealtimeService = {
      clearAll: jest.fn<() => void>(),
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
      mockDemoOrderRepository as any,
      mockRealtimeService as any,
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
      expect(result).toEqual(responseDto);
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
      expect(result).toEqual(responseDto);
    });

    it('rejects request with missing or empty qrToken', async () => {
      await expect(
        controller.authenticateWithQr({ qrToken: '' } as VerifyQrDto),
      ).rejects.toThrow(BadRequestException);
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
    it('logs out guest session successfully', async () => {
      mockGuestSessionsService.logout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully.',
      });

      const req = { sessionToken: 'bearer-token-123' } as any;
      const result = await controller.logout(req);
      expect(mockGuestSessionsService.logout).toHaveBeenCalledWith(
        'bearer-token-123',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('getDemoTokens', () => {
    it('returns demo tokens record from service in test/dev with DEMO_MODE=true', () => {
      const result = controller.getDemoTokens();
      expect(result).toEqual({
        tokens: { '101-checked-in': 'demo-qr-token-101' },
      });
    });

    it('rejects demo tokens with UnauthorizedException when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => controller.getDemoTokens()).toThrow(UnauthorizedException);
    });

    it('rejects demo tokens with UnauthorizedException when DEMO_MODE is not true', () => {
      process.env.DEMO_MODE = 'false';
      expect(() => controller.getDemoTokens()).toThrow(UnauthorizedException);
    });

    it('strictly rejects in production even if ALLOW_DEMO_TOKENS=true is set (no backdoor)', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEMO_TOKENS = 'true';
      expect(() => controller.getDemoTokens()).toThrow(UnauthorizedException);
      delete process.env.ALLOW_DEMO_TOKENS;
    });
  });

  describe('resetDemoState', () => {
    it('executes in-memory demo reset on qrTokenService, orderRepository, and realtimeService', () => {
      const result = controller.resetDemoState();

      expect(result.success).toBe(true);
      expect(result.cleared).toEqual({
        inMemoryOrders: true,
        qrSeenNonces: true,
        realtimeChannels: true,
      });
      expect(mockQrTokenService.reset).toHaveBeenCalledTimes(1);
      expect(mockDemoOrderRepository.reset).toHaveBeenCalledTimes(1);
      expect(mockRealtimeService.clearAll).toHaveBeenCalledTimes(1);
    });

    it('rejects demo reset with UnauthorizedException when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => controller.resetDemoState()).toThrow(UnauthorizedException);
    });

    it('rejects demo reset with UnauthorizedException when DEMO_MODE is not true', () => {
      process.env.DEMO_MODE = 'false';
      expect(() => controller.resetDemoState()).toThrow(UnauthorizedException);
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
