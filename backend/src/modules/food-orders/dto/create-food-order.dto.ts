import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateFoodOrderItemDto } from './create-food-order-item.dto.js';

export class CreateFoodOrderDto {
  @ApiProperty({
    type: [CreateFoodOrderItemDto],
    description: 'List of order items with quantities and special requests',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Order must contain at least one item.' })
  @ValidateNested({ each: true })
  @Type(() => CreateFoodOrderItemDto)
  items!: CreateFoodOrderItemDto[];

  @ApiPropertyOptional({
    example: 'Severe peanut allergy, gluten sensitive',
    maxLength: 300,
    description:
      'Order-level allergy notes or dietary precautions (max 300 chars)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'Allergy note must not exceed 300 characters.',
  })
  allergyNote?: string;

  @ApiPropertyOptional({
    example: 'idemp-550e8400-e29b-41d4-a716-446655440000',
    description:
      'Client-provided idempotency key. Alternatively supplied via Idempotency-Key header.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  idempotencyKey?: string;
}
