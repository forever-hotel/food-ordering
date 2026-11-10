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
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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

function setSessionCookie(
  res?: Response,
  token?: string,
  expiresAt?: string | Date,
): void {
  if (!res || !token || typeof res.cookie !== 'function') return;
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true';
  const sameSite =
    (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
  const maxAge = expiresAt
    ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
    : 24 * 60 * 60 * 1000;
  res.cookie('foss_guest_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge,
  });
}

function clearSessionCookie(res?: Response): void {
  if (!res || typeof res.clearCookie !== 'function') return;
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true';
  const sameSite =
    (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
  res.clearCookie('foss_guest_session', {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: '/',
  });
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
    @Res({ passthrough: true }) res?: Response,
  ): Promise<GuestSessionResponseDto> {
    if (!body || typeof body !== 'object' || !body.qrToken) {
      throw new BadRequestException('Request body with qrToken is required.');
    }

    const token = body.qrToken.trim();
    let sessionResponse: GuestSessionResponseDto;

    // Differentiate between opaque single-use activation credentials and signed development tokens
    if (!token.includes('.')) {
      if (!this.qrActivationService) {
        throw new ServiceUnavailableException(
          'QR activation service is unconfigured.',
        );
      }
      sessionResponse =
        await this.qrActivationService.redeemActivationCredential(token);
    } else {
      // Signed tokens (strictly prohibited in production environments; overrides forbidden)
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException(
          'Legacy signed QR tokens are strictly disabled in production. Authoritative single-use FDS-issued QR activation credentials are required.',
        );
      }
      sessionResponse =
        await this.guestSessionsService.authenticateWithQr(token);
    }

    setSessionCookie(
      res,
      sessionResponse.sessionToken,
      sessionResponse.expiresAt,
    );
    return sessionResponse;
  }

  /**
   * Retrieves the current authenticated guest's active session and stay context.
   */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  getMe(
    @CurrentGuest() guest: GuestContext,
    @Req() req?: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ): GuestContext & {
    active: boolean;
    expiresAt?: string;
    sessionToken?: string;
  } {
    const record = (
      req as AuthenticatedRequest & { sessionRecord?: { expiresAt: Date } }
    )?.sessionRecord;
    const result: GuestContext & {
      active: boolean;
      expiresAt?: string;
      sessionToken?: string;
    } = {
      ...guest,
      active: true,
    };
    if (record?.expiresAt) {
      result.expiresAt = new Date(record.expiresAt).toISOString();
    }
    if (req?.sessionToken) {
      setSessionCookie(
        res,
        req.sessionToken,
        record?.expiresAt || guest?.stayEnd,
      );
      // Only expose sessionToken in JSON when requested via explicit Bearer header
      if ((req as any)?.authSource === 'bearer') {
        result.sessionToken = req.sessionToken;
      }
    }
    return result;
  }

  @Get('realtime-session')
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  realtimeSession(@Req() req: AuthenticatedRequest) {
    const record = (
      req as AuthenticatedRequest & { sessionRecord: { expiresAt: Date } }
    ).sessionRecord;
    return {
      sub: req.guest.sessionId,
      role: 'GUEST',
      bookingId: req.guest.bookingId,
      roomNumber: req.guest.roomNumber,
      expiresAt: Math.floor(new Date(record.expiresAt).getTime() / 1000),
      passwordChangeRequired: false,
    };
  }

  @Post('realtime-ticket')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  async realtimeTicket(@Req() req: AuthenticatedRequest) {
    const url = process.env.SHARED_WEBSOCKET_URL;
    const key = process.env.WEBSOCKET_RELAY_KEY;
    if (!url || !key)
      throw new ServiceUnavailableException(
        'Realtime service is not configured',
      );
    try {
      const response = await fetch(
        `${url.replace(/\/$/, '')}/internal/tickets/foss`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${req.sessionToken}`,
            'x-relay-key': key,
          },
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('Realtime service is unavailable');
    }
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
    @Res({ passthrough: true }) res?: Response,
  ): Promise<{ success: boolean; message: string }> {
    clearSessionCookie(res);
    return this.guestSessionsService.logout(req.sessionToken);
  }

  /**
   * Renews an active guest session for multi-day stays without requiring a new QR scan.
   */
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestAuthGuard)
  async renewSession(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<GuestSessionResponseDto> {
    const renewed = await this.guestSessionsService.renewSession(
      req.sessionToken,
    );
    setSessionCookie(res, renewed.sessionToken, renewed.expiresAt);
    return renewed;
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
