import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';

export enum TaskType {
  EXTRA_TOWELS = 'EXTRA_TOWELS',
  ROOM_CLEANING = 'ROOM_CLEANING',
  TOILETRIES = 'TOILETRIES',
  MAINTENANCE = 'MAINTENANCE',
  LUGGAGE_ASSISTANCE = 'LUGGAGE_ASSISTANCE',
  OTHER = 'OTHER',
}

export enum TaskPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class WkmsCreateTaskDto {
  @ApiPropertyOptional({ example: 'task-uuid-101' })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ enum: TaskType, example: TaskType.EXTRA_TOWELS })
  @IsNotEmpty()
  taskType!: string;

  @ApiPropertyOptional({
    example: 'Please provide two extra bath towels and a bath mat',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: TaskPriority, default: TaskPriority.NORMAL })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority: TaskPriority = TaskPriority.NORMAL;

  @ApiProperty({ example: 'idemp-wkms-101-001' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiPropertyOptional({ enum: ContractVersion, default: ContractVersion.V1_0 })
  @IsString()
  @IsOptional()
  version?: string = ContractVersion.V1_0;
}
