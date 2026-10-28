import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentGuest } from './decorators/current-guest.decorator.js';
import { GuestSessionResponseDto } from './dto/guest-session-response.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { GuestAuthGuard } from './guards/guest-auth.guard.js';
import type { GuestContext } from './interfaces/guest-context.interface.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
import { QrTokenService } from './services/qr-token.service.js';

interface AuthenticatedRequest extends Request {
  guest: GuestContext;
  sessionToken: string;
}

@ApiTags('guest-sessions')
@Controller('guest-sessions')
export class GuestSessionsController {
  constructor(
    private readonly guestSessionsService: GuestSessionsService,
    private readonly qrTokenService: QrTokenService,
  ) {}

  /**
   * Redeems a cryptographically signed QR code to establish a guest session.
   */
  @Post('qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem QR code for guest session',
    description:
      'Validates a cryptographically signed QR code against Front Desk stay records and establishes a room-bound session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session successfully created or refreshed',
    type: GuestSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed QR token or missing request body',
  })
  @ApiResponse({
    status: 401,
    description: 'Forged signature, expired token, or replayed nonce',
  })
  @ApiResponse({
    status: 403,
    description:
      'Guest stay is not checked in, cancelled, or outside stay duration',
  })
  async authenticateWithQr(
    @Body() body: VerifyQrDto,
  ): Promise<GuestSessionResponseDto> {
    if (!body || typeof body !== 'object' || !body.qrToken) {
      throw new BadRequestException('Request body with qrToken is required.');
    }

    return this.guestSessionsService.authenticateWithQr(body.qrToken);
  }

  /**
   * Retrieves the current authenticated guest's active session and stay context.
   */
  @Get('me')
  @UseGuards(GuestAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current authenticated guest context',
    description:
      'Returns active room and stay information for the authenticated bearer token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated guest context',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, expired, or invalid bearer token',
  })
  getMe(
    @CurrentGuest() guest: GuestContext,
  ): GuestContext & { active: boolean } {
    return {
      ...guest,
      active: true,
    };
  }

  /**
   * Logs out the current guest session, invalidating the session token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GuestAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Logout current guest session',
    description: 'Invalidates the bearer session token in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session invalidated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized access',
  })
  async logout(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.guestSessionsService.logout(req.sessionToken);
  }

  /**
   * Helper endpoint providing pre-signed QR tokens for demo rooms.
   */
  @Get('demo-tokens')
  @ApiOperation({
    summary: 'Get pre-signed demo QR tokens',
    description:
      'Provides pre-generated, cryptographically signed QR tokens for testing demo rooms (101 Checked-In, 102 Reserved, 103 Checked-Out, 104 Cancelled, 105 Expired).',
  })
  @ApiResponse({
    status: 200,
    description: 'Map of room fixture labels to signed QR token strings',
  })
  getDemoTokens(): { tokens: Record<string, string> } {
    return {
      tokens: this.qrTokenService.getDemoTokens(),
    };
  }
}
