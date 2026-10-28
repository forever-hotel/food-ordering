import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BookingStatus } from '../enums/booking-status.enum.js';

/**
 * Sanitized verification response containing approved guest context.
 * PII is kept minimal per SDS Chapter 6 data protection requirements.
 */
export class BookingVerificationResultDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  valid!: boolean;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CHECKED_IN })
  @IsEnum(BookingStatus)
  status!: BookingStatus;

  @ApiProperty({ example: '2026-10-27T14:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  stayStart!: string;

  @ApiProperty({ example: '2026-10-29T11:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  stayEnd!: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  guestName?: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  verifiedAt!: string;
}
