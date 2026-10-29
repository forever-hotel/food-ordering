import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

export class AdvanceComplaintStatusDto {
  @ApiProperty({
    enum: ComplaintStatus,
    example: ComplaintStatus.UNDER_INVESTIGATION,
    description: 'Target complaint status',
  })
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(ComplaintStatus, {
    message:
      'status must be one of: SUBMITTED, UNDER_INVESTIGATION, RESOLVED, ESCALATED',
  })
  status!: ComplaintStatus;

  @ApiPropertyOptional({
    example: 'Manager Sarah',
    description: 'Name of the designated manager handling the complaint',
  })
  @IsOptional()
  @IsString({ message: 'assignedManager must be a string' })
  assignedManager?: string;

  @ApiPropertyOptional({
    example:
      'Guest contacted; replacement soup delivered and dessert provided with compliments.',
    description: 'Detailed resolution notes provided by management',
  })
  @IsOptional()
  @IsString({ message: 'resolutionNotes must be a string' })
  resolutionNotes?: string;
}
