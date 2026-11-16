import { Controller, Get, Query, Sse, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentGuest } from '../modules/guest-sessions/decorators/current-guest.decorator.js';
import { GuestAuthGuard } from '../modules/guest-sessions/guards/guest-auth.guard.js';
import type { GuestContext } from '../modules/guest-sessions/interfaces/guest-context.interface.js';
import { PollEventsQueryDto } from './dto/poll-events-query.dto.js';
import { PollEventsResponseDto } from './dto/poll-events-response.dto.js';
import { FossRealtimeEvent } from './dto/realtime-event.dto.js';
import { RealtimeService } from './realtime.service.js';

@ApiTags('Realtime Events')
@ApiBearerAuth()
@UseGuards(GuestAuthGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse('events/stream')
  @ApiOperation({
    summary: 'Subscribe to room-scoped real-time event stream (SSE)',
    description:
      'Provides a Server-Sent Events stream delivering live updates for orders, service requests, and session status to authorized guest stay.',
  })
  @ApiResponse({
    status: 200,
    description: 'Server-Sent Events real-time stream established',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired guest session',
  })
  public streamEvents(
    @CurrentGuest() guest: GuestContext,
  ): Observable<{ data: FossRealtimeEvent<unknown> }> {
    return this.realtimeService.getChannelStream(
      guest.bookingId,
      guest.roomNumber,
    );
  }

  @Get('events/poll')
  @ApiOperation({
    summary: 'Poll room-scoped real-time events (REST fallback)',
    description:
      'Fallback polling endpoint for clients without active SSE connection or reconnecting after network drops. Returns buffered events since requested version.',
  })
  @ApiResponse({
    status: 200,
    description: 'Buffered events retrieved successfully',
    type: PollEventsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired guest session',
  })
  public pollEvents(
    @CurrentGuest() guest: GuestContext,
    @Query() query?: PollEventsQueryDto,
  ): PollEventsResponseDto {
    return this.realtimeService.getEventsSince(
      guest.bookingId,
      guest.roomNumber,
      query?.sinceVersion,
      query?.sinceTimestamp,
    );
  }
}
