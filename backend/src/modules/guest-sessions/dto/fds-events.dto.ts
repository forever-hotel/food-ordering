import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FdsCheckoutEventDto {
  @ApiProperty({ description: 'Unique event identifier for idempotency' })
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @ApiProperty({
    description: 'Event type identifier',
    example: 'fds.guest.checkout',
  })
  @IsString()
  @IsNotEmpty()
  eventType!: 'fds.guest.checkout';

  @ApiProperty({ description: 'Authoritative booking identifier' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ description: 'Room number being vacated' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ description: 'Checkout timestamp (ISO 8601)' })
  @IsString()
  @IsNotEmpty()
  checkoutTime!: string;
}

export class FdsRoomReassignEventDto {
  @ApiProperty({ description: 'Unique event identifier for idempotency' })
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @ApiProperty({
    description: 'Event type identifier',
    example: 'fds.room.reassigned',
  })
  @IsString()
  @IsNotEmpty()
  eventType!: 'fds.room.reassigned';

  @ApiProperty({ description: 'Authoritative booking identifier' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ description: 'Previous room number being vacated' })
  @IsString()
  @IsNotEmpty()
  previousRoomNumber!: string;

  @ApiProperty({ description: 'New room number assigned' })
  @IsString()
  @IsNotEmpty()
  newRoomNumber!: string;

  @ApiProperty({ description: 'Reassignment timestamp (ISO 8601)' })
  @IsString()
  @IsNotEmpty()
  reassignedAt!: string;

  @ApiPropertyOptional({ description: 'Optional reason for room change' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class FdsEventResponseDto {
  @ApiProperty({ description: 'Whether the event was successfully handled' })
  success!: boolean;

  @ApiProperty({ description: 'Whether the event was processed' })
  processed!: boolean;

  @ApiPropertyOptional({
    description: 'True if duplicate event was acknowledged idempotently',
  })
  duplicate?: boolean;

  @ApiProperty({ description: 'Human-readable outcome message' })
  message!: string;

  @ApiPropertyOptional({ description: 'Affected booking identifier' })
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Whether an active session was revoked' })
  sessionRevoked?: boolean;

  @ApiPropertyOptional({ description: 'Identifier of the revoked session' })
  sessionId?: string;
}
