import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TaskType } from '../../../integrations/internal-services/wkms/enums/task-type.enum.js';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

export class GetServiceRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ServiceRequestStatus,
    description: 'Filter by service request status',
  })
  @IsOptional()
  @IsEnum(ServiceRequestStatus, {
    message:
      'status must be one of: SUBMITTED, ASSIGNED, IN_PROGRESS, COMPLETED',
  })
  status?: ServiceRequestStatus;

  @ApiPropertyOptional({
    enum: TaskType,
    description: 'Filter by request category / type',
  })
  @IsOptional()
  @IsEnum(TaskType, { message: 'requestType must be a valid TaskType' })
  requestType?: TaskType;

  @ApiPropertyOptional({
    description: 'Maximum number of service requests to return (1-100)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit cannot exceed 100' })
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Number of records to skip for pagination',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset must be an integer' })
  @Min(0, { message: 'offset cannot be negative' })
  offset?: number = 0;
}
