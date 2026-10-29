import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

export class WkmsTaskStatusUpdatedEventDto {
  @ApiProperty({
    description: 'Unique event identifier for idempotency and deduplication',
    example: 'd3b07384-d113-4623-8ffb-88a8d116a570',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiProperty({
    description: 'Correlated FOSS service request ID',
    example: 'req-uuid-101',
  })
  @IsString({ message: 'requestId must be a string' })
  @IsNotEmpty({ message: 'requestId is required' })
  requestId!: string;

  @ApiProperty({
    description: 'Room number the request belongs to',
    example: '101',
  })
  @IsString({ message: 'roomNumber must be a string' })
  @IsNotEmpty({ message: 'roomNumber is required' })
  roomNumber!: string;

  @ApiProperty({
    enum: ServiceRequestStatus,
    description: 'Updated service request status from WKMS',
    example: ServiceRequestStatus.IN_PROGRESS,
  })
  @IsEnum(ServiceRequestStatus, {
    message:
      'status must be one of: SUBMITTED, ASSIGNED, IN_PROGRESS, COMPLETED',
  })
  status!: ServiceRequestStatus;

  @ApiPropertyOptional({
    description: 'Optional assigned worker or staff name',
    example: 'Housekeeping Staff #14',
  })
  @IsOptional()
  @IsString({ message: 'assignedStaff must be a string' })
  assignedStaff?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the status update occurred in WKMS',
    example: '2026-10-28T07:35:00.000Z',
  })
  @IsString({ message: 'occurredAt must be a valid ISO-8601 string' })
  @IsNotEmpty({ message: 'occurredAt is required' })
  occurredAt!: string;
}
