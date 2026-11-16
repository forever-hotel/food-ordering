import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { BookingVerificationService } from './booking-verification.service.js';
import { BookingVerificationResultDto } from './dto/booking-verification-result.dto.js';
import { VerifyBookingDto } from './dto/verify-booking.dto.js';

@Controller('integrations/booking')
export class BookingController {
  constructor(
    private readonly bookingVerificationService: BookingVerificationService,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
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
