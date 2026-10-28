import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { KmsOrderItemDto } from './kms-order.dto.js';

export class KmsOrderResultDto {
  @ApiProperty({ example: 'order-uuid-101' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ enum: FoodOrderStatus, example: FoodOrderStatus.PLACED })
  @IsEnum(FoodOrderStatus)
  status!: FoodOrderStatus;

  @ApiProperty({ example: 57.0 })
  @IsNumber()
  @IsPositive()
  totalAmount!: number;

  @ApiProperty({ type: [KmsOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KmsOrderItemDto)
  items!: KmsOrderItemDto[];

  @ApiPropertyOptional({ example: 'Severe peanut allergy' })
  @IsString()
  @IsOptional()
  allergyNotes?: string;

  @ApiPropertyOptional({
    example: 25,
    description: 'Estimated delivery in minutes',
  })
  @IsNumber()
  @IsOptional()
  estimatedDeliveryMinutes?: number;

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
