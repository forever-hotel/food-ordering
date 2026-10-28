import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { BookingVerificationService } from './booking-verification.service.js';
import { BookingVerificationResultDto } from './dto/booking-verification-result.dto.js';
import { VerifyBookingDto } from './dto/verify-booking.dto.js';

@ApiTags('integrations')
@Controller('integrations/booking')
export class BookingController {
  constructor(
    private readonly bookingVerificationService: BookingVerificationService,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify stay with Front Desk Subsystem (FDS)',
    description:
      'Internal verification endpoint checking active check-in status, room assignment, and stay window.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking verified successfully',
    type: BookingVerificationResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters or empty request body',
  })
  @ApiResponse({
    status: 403,
    description: 'Room mismatch, non-checked-in status, or expired stay window',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking identifier not found in FDS',
  })
  async verifyBooking(
    @Body() body: VerifyBookingDto,
  ): Promise<BookingVerificationResultDto> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    return this.bookingVerificationService.verifyStay(
      body.bookingId,
      body.roomNumber,
    );
  }
}
