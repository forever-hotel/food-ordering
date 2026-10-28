import { ApiProperty } from '@nestjs/swagger';

export class GuestSessionResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the guest session',
    example: '4a71b289-4fa2-4fcf-8705-0e6d62a27ff8',
  })
  sessionId!: string;

  @ApiProperty({
    description: 'Associated hotel booking identifier',
    example: 'b1010000-0000-4000-8000-000000000101',
  })
  bookingId!: string;

  @ApiProperty({
    description: 'Assigned hotel room number',
    example: '101',
  })
  roomNumber!: string;

  @ApiProperty({
    description: 'High-entropy bearer token for Authorization header',
    example: 'd9b3e10fa654...',
  })
  sessionToken!: string;

  @ApiProperty({
    description: 'Guest name on the booking record',
    example: 'Demo Guest 101',
    required: false,
  })
  guestName?: string;

  @ApiProperty({
    description: 'Check-in stay start timestamp (ISO 8601)',
    example: '2026-10-27T08:00:00.000Z',
  })
  stayStart!: string;

  @ApiProperty({
    description: 'Expected check-out timestamp (ISO 8601)',
    example: '2026-10-30T12:00:00.000Z',
  })
  stayEnd!: string;

  @ApiProperty({
    description: 'Session expiration timestamp (ISO 8601)',
    example: '2026-10-29T14:00:00.000Z',
  })
  expiresAt!: string;

  @ApiProperty({
    description: 'Session creation timestamp (ISO 8601)',
    example: '2026-10-28T14:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Active status indicator of the session',
    example: true,
  })
  active!: boolean;
}
