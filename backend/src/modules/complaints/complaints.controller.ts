import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InternalServiceGuard } from '../../common/auth/internal-service.guard.js';
import { CurrentGuest } from '../guest-sessions/decorators/current-guest.decorator.js';
import { GuestAuthGuard } from '../guest-sessions/guards/guest-auth.guard.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { ComplaintsService } from './complaints.service.js';
import { AdvanceComplaintStatusDto } from './dto/advance-complaint-status.dto.js';
import { ComplaintResponseDto } from './dto/complaint-response.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { GetComplaintsQueryDto } from './dto/get-complaints-query.dto.js';
import { MadComplaintStatusUpdatedEventDto } from './dto/mad-status-event.dto.js';

@ApiTags('Complaints')
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Submit a guest complaint',
    description:
      'Creates a room-bound guest complaint with category, severity, and optional order/request references, durable persistence in Neon, and upstream dispatch to MAD.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Complaint successfully created and registered',
    type: ComplaintResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Validation error or referenced order/request does not belong to the active stay',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid, or expired guest session token',
  })
  public async fileComplaint(
    @CurrentGuest() guest: GuestContext,
    @Body() dto: CreateComplaintDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ): Promise<ComplaintResponseDto> {
    return this.complaintsService.fileComplaint(guest, dto, idempotencyHeader);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'List guest complaints for current stay',
    description:
      'Returns all complaints filed during the authenticated active hotel stay, with optional status/category filtering and pagination.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of complaints for the active stay',
    type: [ComplaintResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid, or expired guest session token',
  })
  public async getComplaints(
    @CurrentGuest() guest: GuestContext,
    @Query() query: GetComplaintsQueryDto,
  ): Promise<ComplaintResponseDto[]> {
    return this.complaintsService.getComplaints(guest, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Get complaint details by ID',
    description:
      'Returns full details and progression timeline of a specific complaint owned by the current guest stay.',
  })
  @ApiParam({
    name: 'id',
    description: 'Public complaint reference ID (e.g., CMP-20261029-A1B2C3)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Complaint details and timeline retrieved',
    type: ComplaintResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Complaint not found or belongs to another stay',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid, or expired guest session token',
  })
  public async getComplaintById(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
  ): Promise<ComplaintResponseDto> {
    return this.complaintsService.getComplaintById(guest, id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Advance complaint status (DEMO_MODE / Manager action)',
    description:
      'Advances or updates the status of a complaint for demo rehearsal flows or mock manager resolution.',
  })
  @ApiParam({
    name: 'id',
    description: 'Public complaint reference ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Complaint status advanced successfully',
    type: ComplaintResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid status progression or regression attempted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Complaint not found or belongs to another stay',
  })
  public async advanceComplaintStatus(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
    @Body() dto: AdvanceComplaintStatusDto,
  ): Promise<ComplaintResponseDto> {
    return this.complaintsService.advanceComplaintStatus(guest, id, dto);
  }

  @Post('internal/events/status-updated')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalServiceGuard)
  @ApiOperation({
    summary: 'Internal webhook to consume MAD complaint status events',
    description:
      'Consumes status updates from MAD, deduplicating events and advancing complaint lifecycle.',
  })
  @ApiHeader({
    name: 'x-internal-service-key',
    required: false,
    description: 'Internal service shared key',
  })
  @ApiHeader({
    name: 'x-fds-signature',
    required: false,
    description: 'Alternative signature header for internal webhooks',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'MAD status event processed successfully or deduplicated',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - missing or invalid internal service key',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - invalid credentials or room number mismatch',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Complaint not found',
  })
  public async handleMadStatusEvent(
    @Body() body: MadComplaintStatusUpdatedEventDto,
  ): Promise<{
    processed: boolean;
    message: string;
    complaint?: ComplaintResponseDto;
  }> {
    return this.complaintsService.handleMadStatusEvent(body);
  }
}
