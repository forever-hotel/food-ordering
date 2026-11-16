import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';
import { TaskPriority } from '../../../integrations/internal-services/wkms/dto/wkms-task.dto.js';

export class ServiceRequestTimelineStepDto {
  @ApiProperty({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.SUBMITTED,
  })
  status!: ServiceRequestStatus;

  @ApiProperty({ example: 'Request Submitted' })
  label!: string;

  @ApiProperty({ example: true })
  completed!: boolean;

  @ApiProperty({ example: true })
  current!: boolean;

  @ApiPropertyOptional({ example: '2026-10-28T07:30:00.000Z' })
  timestamp?: string;
}

export class ServiceRequestResponseDto {
  @ApiProperty({ example: 'req-uuid-101' })
  requestId!: string;

  @ApiProperty({ example: '101' })
  roomNumber!: string;

  @ApiProperty({ example: 'booking-uuid-101' })
  bookingId!: string;

  @ApiProperty({ example: 'EXTRA_TOWELS' })
  requestType!: string;

  @ApiPropertyOptional({
    example: 'Please bring 2 extra towels',
  })
  description!: string | null;

  @ApiProperty({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.SUBMITTED,
  })
  status!: ServiceRequestStatus;

  @ApiProperty({
    enum: TaskPriority,
    example: TaskPriority.NORMAL,
  })
  priority!: TaskPriority;

  @ApiPropertyOptional({ example: 'Staff Housekeeping #12' })
  assignedStaff?: string | null;

  @ApiProperty({ example: 20 })
  estimatedCompletionMinutes!: number;

  @ApiPropertyOptional({ example: 'task-wkms-101' })
  taskId?: string | null;

  @ApiProperty({ example: 'idemp-req-101-001' })
  idempotencyKey!: string;

  @ApiProperty({ example: '2026-10-28T07:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-28T07:30:00.000Z' })
  updatedAt!: string;

  @ApiProperty({
    type: [ServiceRequestTimelineStepDto],
    description:
      'Four-stage progression timeline (Submitted -> Assigned -> In Progress -> Completed)',
  })
  timeline!: ServiceRequestTimelineStepDto[];
}
