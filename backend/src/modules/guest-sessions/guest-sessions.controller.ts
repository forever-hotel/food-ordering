import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { InternalServiceGuard } from '../../common/auth/internal-service.guard.js';
import { RoomOwnershipGuard } from '../../common/auth/room-ownership.guard.js';
import { CurrentGuest } from './decorators/current-guest.decorator.js';
import {
  FdsCheckoutEventDto,
  FdsEventResponseDto,
  FdsRoomReassignEventDto,
} from './dto/fds-events.dto.js';
import { GuestSessionResponseDto } from './dto/guest-session-response.dto.js';
import { IssueQrDto, IssueQrResponseDto } from './dto/issue-qr.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { GuestAuthGuard } from './guards/guest-auth.guard.js';
import type { GuestContext } from './interfaces/guest-context.interface.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
import { QrActivationService } from './services/qr-activation.service.js';
import { QrTokenService } from './services/qr-token.service.js';

interface AuthenticatedRequest extends Request {
  guest: GuestContext;
  sessionToken: string;
}

@Controller('guest-sessions')
export class GuestSessionsController {
  constructor(
    private readonly guestSessionsService: GuestSessionsService,
    private readonly qrTokenService: QrTokenService,
    @Optional() private readonly qrActivationService?: QrActivationService,
  ) {}

  /**
   * Protected internal endpoint for Front Desk System (FDS) to request a secure QR activation slip.
   *
   * Security & Architecture:
   * - Restricted to authenticated internal FDS service identities via InternalServiceGuard.
   * - Validates checked-in booking and room assignment against FDS stay contract.
   * - Atomically revokes any previous unredeemed activation credentials for this booking (reissue safety).
   * - Stores ONLY the SHA-256 hash in PostgreSQL; raw activation token is returned once for printing.
   * - Explicit no-store cache header to prevent intermediate proxy credential caching.
   */
  @Post('internal/qr/issue')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(InternalServiceGuard)
  async issueGuestQrSlip(
    @Body() body: IssueQrDto,
  ): Promise<IssueQrResponseDto> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required.');
    }
    if (!this.qrActivationService) {
      throw new ServiceUnavailableException(
        'QR activation service is unconfigured.',
      );
    }
    return this.qrActivationService.issueActivationCredential(body);
  }

  /**
   * Alias endpoint for backwards/direct compatibility with alternative FDS gateway path conventions.
   */
  @Post('internal/qr-issue')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(InternalServiceGuard)
  async issueGuestQrSlipAlias(
    @Body() body: IssueQrDto,
  ): Promise<IssueQrResponseDto> {
    return this.issueGuestQrSlip(body);
  }

  /**
   * Redeems an activation credential or signed QR code to establish a room-scoped guest session.
   *
   * Single-Use & Replay Protection:
   * - Opaque 256-bit activation tokens are redeemed atomically against the database.
   * - Once redeemed, the activation token cannot be reused by anyone.
   * - In development/test environments, signed fixture tokens (containing '.') are verified
   *   via QrTokenService to preserve test fixture compatibility.
   */
  @Post('qr')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async authenticateWithQr(
    @Body() body: VerifyQrDto,
  ): Promise<GuestSessionResponseDto> {
    if (!body || typeof body !== 'object' || !body.qrToken) {
      throw new BadRequestException('Request body with qrToken is required.');
    }

    const token = body.qrToken.trim();

    // Differentiate between opaque single-use activation credentials and signed development tokens
    if (!token.includes('.')) {
      if (!this.qrActivationService) {
        throw new ServiceUnavailableException(
          'QR activation service is unconfigured.',
        );
      }
      return this.qrActivationService.redeemActivationCredential(token);
    }

    // Signed tokens (used in local development demo fixtures)
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_LEGACY_QR_TOKENS !== 'true'
    ) {
      throw new UnauthorizedException(
        'Legacy signed QR tokens are disabled in production. Please use an authoritative FDS-issued activation slip.',
      );
    }

    return this.guestSessionsService.authenticateWithQr(token);
  }

  /**
   * Retrieves the current authenticated guest's active session and stay context.
   */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  getMe(
    @CurrentGuest() guest: GuestContext,
  ): GuestContext & { active: boolean } {
    return {
      ...guest,
      active: true,
    };
  }

  /**
   * Verifies access to room-scoped resources.
   * Enforces server-side room ownership: rejects cross-room access with 403 Forbidden.
   */
  @Get('rooms/:roomNumber')
  @UseGuards(GuestAuthGuard, RoomOwnershipGuard)
  verifyRoomAccess(
    @Param('roomNumber') roomNumber: string,
    @CurrentGuest() guest: GuestContext,
  ): { authorized: boolean; roomNumber: string; sessionId: string } {
    return {
      authorized: true,
      roomNumber: guest.roomNumber,
      sessionId: guest.sessionId,
    };
  }

  /**
   * Verifies access to booking-scoped resources.
   * Enforces server-side booking ownership: rejects cross-booking access with 403 Forbidden.
   */
  @Get('bookings/:bookingId')
  @UseGuards(GuestAuthGuard, RoomOwnershipGuard)
  verifyBookingAccess(
    @Param('bookingId') bookingId: string,
    @CurrentGuest() guest: GuestContext,
  ): { authorized: boolean; bookingId: string; sessionId: string } {
    return {
      authorized: true,
      bookingId: guest.bookingId,
      sessionId: guest.sessionId,
    };
  }

  /**
   * Logs out the current guest session, invalidating the session token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.guestSessionsService.logout(req.sessionToken);
  }

  /**
   * Helper endpoint providing pre-signed QR tokens for demo rooms.
   * Disabled in production environments.
   */
  @Get('demo-tokens')
  getDemoTokens(): { tokens: Record<string, string> } {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_DEMO_TOKENS !== 'true'
    ) {
      throw new UnauthorizedException(
        'Demo tokens are disabled in production.',
      );
    }
    return {
      tokens: this.qrTokenService.getDemoTokens(),
    };
  }

  /**
   * Internal webhook / demo endpoint to process FDS checkout events.
   * Revokes the guest's active session and prevents subsequent access.
   */
  @Post('internal/events/checkout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalServiceGuard)
  async handleCheckoutEvent(
    @Body() body: FdsCheckoutEventDto,
  ): Promise<FdsEventResponseDto> {
    if (!body || typeof body !== 'object' || !body.eventId || !body.bookingId) {
      throw new BadRequestException('eventId and bookingId are required.');
    }
    return this.guestSessionsService.handleFdsCheckoutEvent(body);
  }

  /**
   * Internal webhook / demo endpoint to process FDS room reassignment events.
   * Revokes previous room session to prevent cross-room access without re-verification.
   */
  @Post('internal/events/room-reassign')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalServiceGuard)
  async handleRoomReassignEvent(
    @Body() body: FdsRoomReassignEventDto,
  ): Promise<FdsEventResponseDto> {
    if (
      !body ||
      typeof body !== 'object' ||
      !body.eventId ||
      !body.bookingId ||
      !body.previousRoomNumber ||
      !body.newRoomNumber
    ) {
      throw new BadRequestException(
        'eventId, bookingId, previousRoomNumber, and newRoomNumber are required.',
      );
    }
    return this.guestSessionsService.handleFdsRoomReassignEvent(body);
  }

  /**
   * Internal lookup endpoint to verify processed event status by eventId.
   */
  @Get('internal/events/:eventId')
  @UseGuards(InternalServiceGuard)
  getProcessedEvent(@Param('eventId') eventId: string): {
    processed: boolean;
    event?: any;
  } {
    return this.guestSessionsService.getProcessedEvent(eventId);
  }
}
