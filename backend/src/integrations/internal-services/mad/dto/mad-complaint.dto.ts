import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';

export enum ComplaintCategory {
  NOISE = 'NOISE',
  CLEANLINESS = 'CLEANLINESS',
  SERVICE = 'SERVICE',
  FOOD = 'FOOD',
  AMENITY = 'AMENITY',
  OTHER = 'OTHER',
}

export enum ComplaintSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class MadCreateComplaintDto {
  @ApiPropertyOptional({ example: 'complaint-uuid-101' })
  @IsString()
  @IsOptional()
  complaintId?: string;

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
  @IsNotEmpty()
  category!: ComplaintCategory;

  @ApiProperty({ enum: ComplaintSeverity, example: ComplaintSeverity.MEDIUM })
  @IsEnum(ComplaintSeverity)
  @IsNotEmpty()
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

  @ApiPropertyOptional({ example: 'order-fixture-001' })
  @IsString()
  @IsOptional()
  relatedOrderId?: string;

  @ApiPropertyOptional({ example: 'task-fixture-001' })
  @IsString()
  @IsOptional()
  relatedTaskId?: string;

  @ApiProperty({ example: 'idemp-mad-101-001' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiPropertyOptional({ enum: ContractVersion, default: ContractVersion.V1_0 })
  @IsString()
  @IsOptional()
  version?: string = ContractVersion.V1_0;
}
