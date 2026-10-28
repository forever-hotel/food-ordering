import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

import { GuestSessionResponseDto } from './dto/guest-session-response.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import type { GuestContext } from './interfaces/guest-context.interface.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
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
  };
  let mockQrTokenService: {
    getDemoTokens: jest.MockedFunction<() => Record<string, string>>;
  };

  beforeEach(() => {
    mockGuestSessionsService = {
      authenticateWithQr: jest.fn<() => Promise<GuestSessionResponseDto>>(),
      logout: jest.fn<() => Promise<{ success: boolean; message: string }>>(),
    };

    mockQrTokenService = {
      getDemoTokens: jest.fn<() => Record<string, string>>().mockReturnValue({
        '101-checked-in': 'demo-qr-token-101',
      }),
    };

    controller = new GuestSessionsController(
      mockGuestSessionsService as unknown as GuestSessionsService,
      mockQrTokenService as unknown as QrTokenService,
    );
  });

  describe('authenticateWithQr', () => {
    it('authenticates valid QR payload and returns session response', async () => {
      const responseDto: GuestSessionResponseDto = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        roomNumber: '101',
        sessionToken: 'raw-token',
        guestName: 'Jane Doe',
        stayStart: '2026-10-27T10:00:00Z',
        stayEnd: '2026-10-30T10:00:00Z',
        expiresAt: '2026-10-29T10:00:00Z',
        createdAt: '2026-10-28T10:00:00Z',
        active: true,
      };

      mockGuestSessionsService.authenticateWithQr.mockResolvedValue(
        responseDto,
      );

      const body: VerifyQrDto = { qrToken: 'valid.qr.token' };
      const result = await controller.authenticateWithQr(body);

      expect(mockGuestSessionsService.authenticateWithQr).toHaveBeenCalledWith(
        'valid.qr.token',
      );
      expect(result).toBe(responseDto);
    });

    it('throws BadRequestException when body or qrToken is missing', async () => {
      await expect(
        controller.authenticateWithQr(null as unknown as VerifyQrDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.authenticateWithQr({ qrToken: '' } as VerifyQrDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMe', () => {
    it('returns current guest context with active status', () => {
      const guest: GuestContext = {
        sessionId: 'sess-1',
        bookingId: 'book-1',
        guestId: 'sess-1',
        roomNumber: '101',
        guestName: 'Jane Doe',
        role: 'GUEST',
      };

      const result = controller.getMe(guest);

      expect(result).toEqual({
        ...guest,
        active: true,
      });
    });
  });

  describe('logout', () => {
    it('delegates logout to guestSessionsService with session token', async () => {
      mockGuestSessionsService.logout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully.',
      });

      const req = {
        sessionToken: 'active-session-token',
        guest: {} as GuestContext,
      } as unknown as Parameters<typeof controller.logout>[0];

      const result = await controller.logout(req);

      expect(mockGuestSessionsService.logout).toHaveBeenCalledWith(
        'active-session-token',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('getDemoTokens', () => {
    it('returns demo tokens from qrTokenService', () => {
      const result = controller.getDemoTokens();

      expect(result.tokens).toEqual({
        '101-checked-in': 'demo-qr-token-101',
      });
    });
  });
});
