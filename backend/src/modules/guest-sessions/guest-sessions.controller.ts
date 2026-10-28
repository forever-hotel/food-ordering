import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
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
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { GuestAuthGuard } from './guards/guest-auth.guard.js';
import type { GuestContext } from './interfaces/guest-context.interface.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
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
  ) {}

  /**
   * Redeems a cryptographically signed QR code to establish a guest session.
   */
  @Post('qr')
  @HttpCode(HttpStatus.OK)
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
  @UseGuards(GuestAuthGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.guestSessionsService.logout(req.sessionToken);
  }

  /**
   * Helper endpoint providing pre-signed QR tokens for demo rooms.
   */
  @Get('demo-tokens')
  getDemoTokens(): { tokens: Record<string, string> } {
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
