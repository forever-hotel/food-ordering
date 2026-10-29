import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFoodOrderItemDto {
  @ApiProperty({
    example: 'menu-item-001',
    description: 'Unique menu item identifier',
  })
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: 20,
    description: 'Quantity to order',
  })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @ApiPropertyOptional({
    example: 'Extra crispy, dressing on the side',
    maxLength: 200,
    description: 'Optional preparation instructions or special requests',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  specialNotes?: string;
}
