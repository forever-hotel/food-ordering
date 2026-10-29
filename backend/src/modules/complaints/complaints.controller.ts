import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentGuest } from '../guest-sessions/decorators/current-guest.decorator.js';
import { GuestAuthGuard } from '../guest-sessions/guards/guest-auth.guard.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintResponseDto } from './dto/complaint-response.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';

@ApiTags('Complaints')
@ApiBearerAuth()
@UseGuards(GuestAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
  @ApiOperation({
    summary: 'List guest complaints for current stay',
    description:
      'Returns all complaints filed during the authenticated active hotel stay.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of complaints for the active stay',
    type: [ComplaintResponseDto],
  })
  public async getComplaints(
    @CurrentGuest() guest: GuestContext,
  ): Promise<ComplaintResponseDto[]> {
    return this.complaintsService.getComplaints(guest);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get complaint details by ID',
    description:
      'Returns full details of a specific complaint owned by the current guest stay.',
  })
  @ApiParam({
    name: 'id',
    description: 'Public complaint reference ID (e.g., CMP-20261029-A1B2C3)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Complaint details retrieved',
    type: ComplaintResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Complaint not found or belongs to another stay',
  })
  public async getComplaintById(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
  ): Promise<ComplaintResponseDto> {
    return this.complaintsService.getComplaintById(guest, id);
  }
}
