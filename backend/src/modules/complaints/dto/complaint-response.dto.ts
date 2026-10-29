import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

export class ComplaintTimelineStepDto {
  @ApiProperty({
    enum: ComplaintStatus,
    example: ComplaintStatus.SUBMITTED,
    description: 'Status corresponding to this timeline milestone',
  })
  status!: ComplaintStatus;

  @ApiProperty({
    example: 'Complaint Submitted',
    description: 'Human-readable label for the milestone',
  })
  label!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this stage has been completed',
  })
  completed!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether this stage is currently active',
  })
  current!: boolean;

  @ApiPropertyOptional({
    example: '2026-10-29T20:00:00.000Z',
    description: 'Timestamp when this milestone was reached',
  })
  timestamp?: string;
}

export class ComplaintResponseDto {
  @ApiProperty({
    example: 'CMP-20261029-A1B2C3',
    description: 'Unique public reference identifier for the complaint',
  })
  complaintId!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID of the guest booking stay owning this complaint',
  })
  bookingId!: string;

  @ApiProperty({
    example: '101',
    description: 'Hotel room number bound to the guest stay',
  })
  roomNumber!: string;

  @ApiProperty({
    enum: ComplaintCategory,
    example: ComplaintCategory.FOOD,
    description: 'Category of the complaint',
  })
  category!: ComplaintCategory;

  @ApiProperty({
    enum: ComplaintSeverity,
    example: ComplaintSeverity.MEDIUM,
    description: 'Severity level of the complaint',
  })
  severity!: ComplaintSeverity;

  @ApiProperty({
    example: 'Cold soup delivered',
    description: 'Subject summary of the complaint',
  })
  subject!: string;

  @ApiProperty({
    example:
      'The mushroom soup was completely cold when delivered to the room.',
    description: 'Detailed description of the complaint',
  })
  description!: string;

  @ApiProperty({
    enum: ComplaintStatus,
    example: ComplaintStatus.SUBMITTED,
    description: 'Current lifecycle status of the complaint',
  })
  status!: ComplaintStatus;

  @ApiPropertyOptional({
    example: 'order-101-001',
    description: 'Referenced food order ID if applicable',
  })
  relatedOrderId?: string | null;

  @ApiPropertyOptional({
    example: 'req-101-001',
    description: 'Referenced service request ID if applicable',
  })
  relatedRequestId?: string | null;

  @ApiPropertyOptional({
    example: 'Manager on Duty Sarah assigned',
    description: 'Designated manager or personnel assigned to investigate',
  })
  assignedManager?: string | null;

  @ApiPropertyOptional({
    example: 'Kitchen contacted; replacement meal delivered with compliments.',
    description: 'Resolution notes recorded by management',
  })
  resolutionNotes?: string | null;

  @ApiProperty({
    example: '2026-10-29T20:00:00.000Z',
    description: 'Timestamp when the complaint was submitted',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2026-10-29T20:00:00.000Z',
    description: 'Timestamp when the complaint was last updated',
  })
  updatedAt!: string;

  @ApiProperty({
    type: [ComplaintTimelineStepDto],
    description: 'Progression timeline for the complaint lifecycle',
  })
  timeline!: ComplaintTimelineStepDto[];
}
