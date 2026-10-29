import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TaskPriority,
  TaskType,
} from '../../../integrations/internal-services/wkms/dto/wkms-task.dto.js';

export class CreateServiceRequestDto {
  @ApiProperty({
    enum: TaskType,
    example: TaskType.EXTRA_TOWELS,
    description: 'Category of service request',
  })
  @IsNotEmpty({ message: 'requestType is required' })
  @IsEnum(TaskType, {
    message:
      'requestType must be one of the approved categories: EXTRA_TOWELS, ROOM_CLEANING, TOILETRIES, MAINTENANCE, LUGGAGE_ASSISTANCE, OTHER',
  })
  requestType!: string;

  @ApiPropertyOptional({
    example: 'Please bring 2 extra towels and bath amenities',
    description: 'Optional guest notes or instructions (max 500 characters)',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(500, { message: 'description cannot exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({
    enum: TaskPriority,
    default: TaskPriority.NORMAL,
    description: 'Priority level for worker dispatch',
  })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'priority must be a valid TaskPriority value',
  })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: 'idemp-req-101-001',
    description: 'Unique client idempotency key for safe retries',
  })
  @IsOptional()
  @IsString({ message: 'idempotencyKey must be a string' })
  idempotencyKey?: string;
}
