import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
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
import { AdvanceServiceRequestStatusDto } from './dto/advance-service-request-status.dto.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { GetServiceRequestsQueryDto } from './dto/get-service-requests-query.dto.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { WkmsTaskStatusUpdatedEventDto } from './dto/wkms-status-event.dto.js';
import { ServiceRequestsService } from './service-requests.service.js';

@ApiTags('Service Requests')
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Submit a room-bound service request',
    description:
      'Creates a service request (e.g. housekeeping, amenities) bound to the active guest session stay and dispatches a task to WKMS.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Unique client key preventing duplicate task creation',
  })
  @ApiResponse({
    status: 201,
    description:
      'Service request created and worker task dispatched successfully',
    type: ServiceRequestResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed on category or parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired guest session',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - idempotency key reused across different rooms',
  })
  @ApiResponse({
    status: 503,
    description: 'Upstream WKMS service unavailable',
  })
  public async createServiceRequest(
    @CurrentGuest() guest: GuestContext,
    @Body() dto: CreateServiceRequestDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ): Promise<ServiceRequestResponseDto> {
    return this.serviceRequestsService.createServiceRequest(
      guest,
      dto,
      idempotencyKeyHeader,
    );
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Retrieve all service requests for the current stay',
    description:
      'Returns a list of all service requests submitted by the authenticated guest during their active stay, with optional status and type filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service requests retrieved successfully',
    type: [ServiceRequestResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired guest session',
  })
  public async getGuestServiceRequests(
    @CurrentGuest() guest: GuestContext,
    @Query() query?: GetServiceRequestsQueryDto,
  ): Promise<ServiceRequestResponseDto[]> {
    return this.serviceRequestsService.getGuestServiceRequests(guest, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Track a specific service request by ID',
    description:
      'Returns status, worker assignment, estimated completion, and full progression timeline.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique service request identifier',
    example: 'req-uuid-101',
  })
  @ApiResponse({
    status: 200,
    description: 'Service request retrieved successfully',
    type: ServiceRequestResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired guest session',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - request belongs to another room or stay',
  })
  @ApiResponse({
    status: 404,
    description: 'Service request not found',
  })
  public async getGuestServiceRequestById(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
  ): Promise<ServiceRequestResponseDto> {
    return this.serviceRequestsService.getGuestServiceRequestById(guest, id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(GuestAuthGuard)
  @ApiOperation({
    summary: 'Advance service request status (DEMO_MODE only)',
    description:
      'Deterministically advances a service request status for demonstration rehearsal flows. Gated by DEMO_MODE=true.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique service request identifier',
    example: 'req-uuid-101',
  })
  @ApiResponse({
    status: 200,
    description: 'Service request status advanced successfully',
    type: ServiceRequestResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - DEMO_MODE is disabled or cross-room access attempted',
  })
  @ApiResponse({
    status: 404,
    description: 'Service request not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - illegal status regression attempted',
  })
  public async advanceServiceRequestStatus(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
    @Body() dto: AdvanceServiceRequestStatusDto,
  ): Promise<ServiceRequestResponseDto> {
    return this.serviceRequestsService.advanceServiceRequestStatus(
      guest,
      id,
      dto.status,
      dto.assignedStaff,
    );
  }

  @Post('internal/events/status-updated')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalServiceGuard)
  @ApiOperation({
    summary: 'Internal webhook to consume WKMS task status events',
    description:
      'Consumes signed worker task status updates from WKMS, deduplicating events and advancing request lifecycle.',
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
    status: 200,
    description:
      'WKMS task status event processed successfully or deduplicated',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid internal service key',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - invalid credentials or room number mismatch',
  })
  @ApiResponse({
    status: 404,
    description: 'Service request not found',
  })
  public async handleWkmsStatusEvent(
    @Body() body: WkmsTaskStatusUpdatedEventDto,
  ): Promise<{
    processed: boolean;
    message: string;
    request?: ServiceRequestResponseDto;
  }> {
    return this.serviceRequestsService.handleWkmsStatusEvent(body);
  }
}
