import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TaskPriority } from '../../../integrations/internal-services/wkms/dto/wkms-task.dto.js';
import { FossServiceCategory } from '../enums/foss-service-category.enum.js';

export class CreateServiceRequestDto {
  @ApiProperty({
    enum: FossServiceCategory,
    example: FossServiceCategory.EXTRA_TOWELS,
    description: 'Category of service request matching approved FOSS service options',
  })
  @IsNotEmpty({ message: 'requestType is required' })
  @IsEnum(FossServiceCategory, {
    message:
      'requestType must be one of the approved categories: ROOM_CLEANING, EXTRA_TOWELS, WATER_BOTTLES, MAINTENANCE, LAUNDRY_PICKUP, OTHER',
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
