import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';

export enum MealPeriod {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  ALL_DAY = 'ALL_DAY',
}

export class KmsMenuItemDto {
  @ApiProperty({ example: 'item-burger-01' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'Signature Wagyu Burger' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    example: 'Flame-grilled wagyu patty with aged cheddar and brioche bun',
  })
  @IsString()
  @IsOptional()
  description!: string | null;

  @ApiProperty({ example: 28.5, description: 'Price in USD' })
  @IsNumber()
  @IsPositive()
  price!: number;

  @ApiProperty({ example: 'Mains' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({
    enum: MealPeriod,
    isArray: true,
    example: [MealPeriod.LUNCH, MealPeriod.DINNER],
  })
  @IsArray()
  mealPeriods!: MealPeriod[];

  @ApiProperty({ example: true })
  @IsBoolean()
  available!: boolean;

  @ApiProperty({ example: 20, description: 'Estimated preparation minutes' })
  @IsNumber()
  estimatedPrepMinutes!: number;

  @ApiPropertyOptional({
    example: 'https://cdn.foreverhotel.com/menu/wagyu-burger.webp',
  })
  @IsString()
  @IsOptional()
  imageUrl!: string | null;

  @ApiProperty({ example: ['GLUTEN_FREE_OPTION'], isArray: true })
  @IsArray()
  dietaryFlags!: string[];

  @ApiProperty({ example: ['Dairy', 'Gluten'], isArray: true })
  @IsArray()
  allergens!: string[];
}

export class KmsMenuCatalogDto {
  @ApiProperty({ enum: ContractVersion, example: ContractVersion.V1_0 })
  @IsString()
  @IsNotEmpty()
  version!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  generatedAt!: string;

  @ApiProperty({
    example: ['Starters', 'Mains', 'Desserts', 'Beverages'],
    isArray: true,
  })
  @IsArray()
  categories!: string[];

  @ApiProperty({ type: [KmsMenuItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KmsMenuItemDto)
  items!: KmsMenuItemDto[];
}
