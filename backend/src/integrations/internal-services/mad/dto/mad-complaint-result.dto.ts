import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ComplaintStatus } from '../../../../modules/complaints/enums/complaint-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { ComplaintCategory, ComplaintSeverity } from './mad-complaint.dto.js';

export class MadComplaintResultDto {
  @ApiProperty({ example: 'complaint-uuid-101' })
  @IsString()
  @IsNotEmpty()
  complaintId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ enum: ComplaintCategory, example: ComplaintCategory.FOOD })
  @IsEnum(ComplaintCategory)
  category!: ComplaintCategory;

  @ApiProperty({ enum: ComplaintSeverity, example: ComplaintSeverity.MEDIUM })
  @IsEnum(ComplaintSeverity)
  severity!: ComplaintSeverity;

  @ApiProperty({ example: 'Cold soup delivered' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({
    example: 'The mushroom soup was completely cold when delivered.',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ enum: ComplaintStatus, example: ComplaintStatus.SUBMITTED })
  @IsEnum(ComplaintStatus)
  status!: ComplaintStatus;

  @ApiPropertyOptional({ example: 'order-fixture-001' })
  @IsString()
  @IsOptional()
  relatedOrderId?: string | null;

  @ApiPropertyOptional({ example: 'task-fixture-001' })
  @IsString()
  @IsOptional()
  relatedTaskId?: string | null;

  @ApiPropertyOptional({ example: 'Manager on Duty Sarah assigned' })
  @IsString()
  @IsOptional()
  assignedManager?: string | null;

  @ApiPropertyOptional({
    example: 'Kitchen contacted, complimentary dessert sent to room.',
  })
  @IsString()
  @IsOptional()
  resolutionNotes?: string | null;

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
