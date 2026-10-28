import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ServiceRequestStatus } from '../../../../modules/service-requests/enums/service-request-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { TaskPriority } from './wkms-task.dto.js';

export class WkmsTaskResultDto {
  @ApiProperty({ example: 'task-uuid-101' })
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ example: 'EXTRA_TOWELS' })
  @IsString()
  @IsNotEmpty()
  taskType!: string;

  @ApiPropertyOptional({
    example: 'Please provide two extra bath towels and a bath mat',
  })
  @IsString()
  @IsOptional()
  description!: string | null;

  @ApiProperty({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.SUBMITTED,
  })
  @IsEnum(ServiceRequestStatus)
  status!: ServiceRequestStatus;

  @ApiProperty({ enum: TaskPriority, example: TaskPriority.NORMAL })
  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @ApiPropertyOptional({ example: 'Staff Housekeeping #12' })
  @IsString()
  @IsOptional()
  assignedStaff?: string | null;

  @ApiPropertyOptional({
    example: 15,
    description: 'Estimated completion minutes',
  })
  @IsNumber()
  @IsOptional()
  estimatedCompletionMinutes?: number;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  createdAt!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  updatedAt!: string;

  @ApiProperty({ enum: ContractVersion, example: ContractVersion.V1_0 })
  @IsString()
  @IsNotEmpty()
  version!: string;
}
