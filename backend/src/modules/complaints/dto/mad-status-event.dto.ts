import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

export class MadComplaintStatusUpdatedEventDto {
  @ApiProperty({
    description: 'Unique event identifier for idempotency and deduplication',
    example: 'd3b07384-d113-4623-8ffb-88a8d116a570',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiProperty({
    description: 'Correlated FOSS complaint reference ID',
    example: 'CMP-20261029-A1B2C3',
  })
  @IsString({ message: 'complaintId must be a string' })
  @IsNotEmpty({ message: 'complaintId is required' })
  complaintId!: string;

  @ApiProperty({
    description: 'Room number the complaint belongs to',
    example: '101',
  })
  @IsString({ message: 'roomNumber must be a string' })
  @IsNotEmpty({ message: 'roomNumber is required' })
  roomNumber!: string;

  @ApiProperty({
    enum: ComplaintStatus,
    description: 'Updated complaint status from MAD',
    example: ComplaintStatus.RESOLVED,
  })
  @IsEnum(ComplaintStatus, {
    message:
      'status must be one of: SUBMITTED, UNDER_INVESTIGATION, RESOLVED, ESCALATED',
  })
  status!: ComplaintStatus;

  @ApiPropertyOptional({
    description: 'Optional assigned manager name',
    example: 'Manager Sarah',
  })
  @IsOptional()
  @IsString({ message: 'assignedManager must be a string' })
  assignedManager?: string;

  @ApiPropertyOptional({
    description: 'Optional resolution notes recorded in MAD',
    example: 'Issue investigated and resolved with the guest directly.',
  })
  @IsOptional()
  @IsString({ message: 'resolutionNotes must be a string' })
  resolutionNotes?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the status update occurred in MAD',
    example: '2026-10-29T21:00:00.000Z',
  })
  @IsString({ message: 'occurredAt must be a valid ISO-8601 string' })
  @IsNotEmpty({ message: 'occurredAt is required' })
  occurredAt!: string;
}
