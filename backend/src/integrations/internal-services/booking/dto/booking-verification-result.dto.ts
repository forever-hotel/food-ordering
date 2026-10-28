import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../enums/booking-status.enum.js';

/**
 * Sanitized verification response containing approved guest context.
 * PII is kept minimal per SDS Chapter 6 data protection requirements.
 */
export class BookingVerificationResultDto {
  @ApiProperty({
    description: 'Whether stay verification succeeded',
    example: true,
  })
  valid!: boolean;

  @ApiProperty({
    description: 'Booking identifier',
    example: 'b1010000-0000-4000-8000-000000000101',
  })
  bookingId!: string;

  @ApiProperty({
    description: 'Assigned room number',
    example: '101',
  })
  roomNumber!: string;

  @ApiProperty({
    description: 'Booking stay lifecycle status',
    enum: BookingStatus,
    example: BookingStatus.CHECKED_IN,
  })
  status!: BookingStatus;

  @ApiProperty({
    description: 'Stay check-in timestamp (ISO 8601)',
    example: '2026-10-27T08:00:00.000Z',
  })
  stayStart!: string;

  @ApiProperty({
    description: 'Stay check-out timestamp (ISO 8601)',
    example: '2026-10-30T12:00:00.000Z',
  })
  stayEnd!: string;

  @ApiProperty({
    description: 'Guest name on booking record',
    example: 'Demo Guest 101',
    required: false,
  })
  guestName?: string;

  @ApiProperty({
    description: 'Timestamp when verification occurred (ISO 8601)',
    example: '2026-10-28T14:00:00.000Z',
  })
  verifiedAt!: string;
}
