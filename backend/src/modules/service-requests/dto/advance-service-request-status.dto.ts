import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

export class AdvanceServiceRequestStatusDto {
  @ApiProperty({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.ASSIGNED,
    description: 'Target service request status',
  })
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(ServiceRequestStatus, {
    message:
      'status must be one of: SUBMITTED, ASSIGNED, IN_PROGRESS, COMPLETED',
  })
  status!: ServiceRequestStatus;

  @ApiPropertyOptional({
    example: 'Housekeeping Staff #14',
    description: 'Optional assigned worker / staff name',
  })
  @IsOptional()
  @IsString({ message: 'assignedStaff must be a string' })
  assignedStaff?: string;
}
