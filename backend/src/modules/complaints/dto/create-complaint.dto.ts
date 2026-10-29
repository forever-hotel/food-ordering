import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';

export class CreateComplaintDto {
  @ApiProperty({
    enum: ComplaintCategory,
    example: ComplaintCategory.FOOD,
    description: 'Category classifying the nature of the complaint',
  })
  @IsEnum(ComplaintCategory)
  @IsNotEmpty()
  category!: ComplaintCategory;

  @ApiProperty({
    enum: ComplaintSeverity,
    example: ComplaintSeverity.MEDIUM,
    description: 'Severity level of the complaint (LOW, MEDIUM, HIGH, URGENT)',
  })
  @IsEnum(ComplaintSeverity)
  @IsNotEmpty()
  severity!: ComplaintSeverity;

  @ApiProperty({
    example: 'Cold soup delivered',
    description: 'Brief summary subject of the complaint (3-150 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  subject!: string;

  @ApiProperty({
    example:
      'The mushroom soup was completely cold when delivered to the room.',
    description:
      'Detailed description of the issue encountered (10-1000 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @Length(10, 1000)
  description!: string;

  @ApiPropertyOptional({
    example: 'order-101-001',
    description:
      'Optional reference to an existing food order within the current guest stay',
  })
  @IsString()
  @IsOptional()
  relatedOrderId?: string;

  @ApiPropertyOptional({
    example: 'req-101-001',
    description:
      'Optional reference to an existing service request within the current guest stay',
  })
  @IsString()
  @IsOptional()
  relatedRequestId?: string;

  @ApiPropertyOptional({
    example: 'idemp-cmp-101-001',
    description:
      'Unique client-supplied idempotency key to prevent duplicate submissions',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
