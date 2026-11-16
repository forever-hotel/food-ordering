import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';

export class GetMenuQueryDto {
  @ApiPropertyOptional({
    enum: MealPeriod,
    description: 'Filter items by meal window',
  })
  @IsEnum(MealPeriod)
  @IsOptional()
  mealPeriod?: MealPeriod;

  @ApiPropertyOptional({
    example: 'Mains',
    description: 'Filter items by category',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only currently orderable items',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  availableOnly?: boolean;
}
