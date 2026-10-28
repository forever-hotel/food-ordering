import { ApiProperty } from '@nestjs/swagger';

/**
 * Data transfer object for requesting booking and room stay verification.
 */
export class VerifyBookingDto {
  @ApiProperty({
    description: 'Authoritative booking identifier from FDS',
    example: 'b1010000-0000-4000-8000-000000000101',
  })
  bookingId!: string;

  @ApiProperty({
    description: 'Room number to verify against booking assignment',
    example: '101',
  })
  roomNumber!: string;
}
