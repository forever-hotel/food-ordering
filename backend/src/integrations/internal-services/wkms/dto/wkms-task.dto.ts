import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';

import { TaskPriority } from '../enums/task-priority.enum.js';
import { TaskType } from '../enums/task-type.enum.js';

export { TaskPriority, TaskType };

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
