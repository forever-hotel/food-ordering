import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
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
import { RealtimeService } from '../../realtime/realtime.service.js';
import { FossDemoOrderRepository } from '../food-orders/repositories/foss-demo-order.repository.js';
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

export const AUTHORIZED_DEMO_BOOKING_IDS = new Set<string>([
  'b1010000-0000-4000-8000-000000000101',
  'b1020000-0000-4000-8000-000000000102',
  'b1030000-0000-4000-8000-000000000103',
  'b2040000-0000-4000-8000-000000000204',
  'b9990000-0000-4000-8000-000000000999',
  'b1040000-0000-4000-8000-000000000104',
  'b1050000-0000-4000-8000-000000000105',
  'b1060000-0000-4000-8000-000000000106',
]);

export const AUTHORIZED_DEMO_STAYS: Array<{
  bookingId: string;
  roomNumber: string;
}> = [
  { bookingId: 'b1010000-0000-4000-8000-000000000101', roomNumber: '101' },
  { bookingId: 'b1020000-0000-4000-8000-000000000102', roomNumber: '102' },
  { bookingId: 'b1030000-0000-4000-8000-000000000103', roomNumber: '103' },
  { bookingId: 'b2040000-0000-4000-8000-000000000204', roomNumber: '204' },
  { bookingId: 'b9990000-0000-4000-8000-000000000999', roomNumber: '999' },
  { bookingId: 'b1040000-0000-4000-8000-000000000104', roomNumber: '104' },
  { bookingId: 'b1050000-0000-4000-8000-000000000105', roomNumber: '105' },
  { bookingId: 'b1060000-0000-4000-8000-000000000106', roomNumber: '106' },
];

function isLoopbackOrLocal(req?: Request): boolean {
  if (!req) return false;
  const ip = req.ip || req.socket?.remoteAddress;
  if (!ip) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    req.hostname === 'localhost'
  );
}

function isDevAuthorized(req?: Request): boolean {
  if (!req) return false;
  const devKey =
    (req.headers?.['x-developer-key'] as string) ||
    (req.headers?.['x-demo-admin-key'] as string);
  const expectedKey = process.env.DEV_DEMO_KEY;
  return Boolean(expectedKey && devKey === expectedKey);
}

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
    @Optional()
    @Inject(forwardRef(() => FossDemoOrderRepository))
    private readonly demoOrderRepository?: FossDemoOrderRepository,
    @Optional()
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService?: RealtimeService,
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
   * Strictly disabled in production and unauthorized environments.
   * Requires trusted local-only access or valid developer authorization.
   */
  @Get('demo-tokens')
  getDemoTokens(@Req() req?: Request): { tokens: Record<string, string> } {
    const isDevOrTest =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const isDemo = process.env.DEMO_MODE === 'true';

    if (!isDevOrTest || !isDemo || process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        'Demo tokens are strictly disabled in production and unauthorized environments.',
      );
    }

    if (
      process.env.NODE_ENV !== 'test' &&
      !isLoopbackOrLocal(req) &&
      !isDevAuthorized(req)
    ) {
      throw new ForbiddenException(
        'Demo utilities require trusted local-only access or valid developer authorization.',
      );
    }

    return {
      tokens: this.qrTokenService.getDemoTokens(),
    };
  }

  /**
   * Development-only demo reset endpoint.
   * Cleans authorized demo in-memory state:
   * 1. QrTokenService redeemed nonces
   * 2. FossDemoOrderRepository in-memory demonstration food orders
   * 3. RealtimeService stay channels, subscriptions, and buffered events
   *
   * Gated strictly by DEMO_MODE=true and non-production development/test environment.
   * Destructive operation: requires trusted local-only access or developer authorization.
   * Multi-tenant safety: global reset is disabled by default to protect unrelated sessions.
   * Only authorized demonstration fixtures are reset unless explicitly overridden.
   * Never modifies persistent PostgreSQL records.
   */
  @Post('demo-reset')
  @HttpCode(HttpStatus.OK)
  resetDemoState(@Req() req?: Request): {
    success: boolean;
    message: string;
    mode: 'global' | 'scoped_fixtures';
    cleared: {
      inMemoryOrders: boolean;
      qrSeenNonces: boolean;
      realtimeChannels: boolean;
      persistentDatabaseRecords: boolean;
    };
  } {
    const isDevOrTest =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const isDemo = process.env.DEMO_MODE === 'true';

    if (!isDevOrTest || !isDemo || process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        'Demo reset is strictly disabled in production and unauthorized environments.',
      );
    }

    if (
      process.env.NODE_ENV !== 'test' &&
      !isLoopbackOrLocal(req) &&
      !isDevAuthorized(req)
    ) {
      throw new ForbiddenException(
        'Destructive demo operations require trusted local-only access or valid developer authorization.',
      );
    }

    const allowGlobal = process.env.ALLOW_GLOBAL_DEMO_RESET === 'true';

    if (allowGlobal) {
      this.qrTokenService.reset();
      this.demoOrderRepository?.reset();
      this.realtimeService?.clearAll();
    } else {
      // Scoped reset: cleans only authorized demonstration fixtures to guarantee session isolation
      this.qrTokenService.resetDemoNonces();
      this.demoOrderRepository?.resetScopedOrders(AUTHORIZED_DEMO_BOOKING_IDS);
      this.realtimeService?.resetScopedChannels(AUTHORIZED_DEMO_STAYS);
    }

    return {
      success: true,
      message: allowGlobal
        ? 'Global demo in-memory state reset successfully.'
        : 'Authorized demo in-memory state and fixture channels reset successfully (scoped). Global reset is disabled to ensure isolation.',
      mode: allowGlobal ? 'global' : 'scoped_fixtures',
      cleared: {
        inMemoryOrders: true,
        qrSeenNonces: true,
        realtimeChannels: true,
        persistentDatabaseRecords: false,
      },
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
