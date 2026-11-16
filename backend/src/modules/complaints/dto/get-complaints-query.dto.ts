import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

export class GetComplaintsQueryDto {
  @ApiPropertyOptional({
    enum: ComplaintStatus,
    description: 'Filter by complaint status',
  })
  @IsOptional()
  @IsEnum(ComplaintStatus, {
    message:
      'status must be one of: SUBMITTED, UNDER_INVESTIGATION, RESOLVED, ESCALATED',
  })
  status?: ComplaintStatus;

  @ApiPropertyOptional({
    enum: ComplaintCategory,
    description: 'Filter by complaint category',
  })
  @IsOptional()
  @IsEnum(ComplaintCategory, {
    message:
      'category must be one of: NOISE, CLEANLINESS, SERVICE, FOOD, AMENITY, OTHER',
  })
  category?: ComplaintCategory;

  @ApiPropertyOptional({
    enum: ComplaintSeverity,
    description: 'Filter by complaint severity level',
  })
  @IsOptional()
  @IsEnum(ComplaintSeverity, {
    message: 'severity must be one of: LOW, MEDIUM, HIGH, URGENT',
  })
  severity?: ComplaintSeverity;

  @ApiPropertyOptional({
    description: 'Maximum number of complaints to return (1-100)',
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
