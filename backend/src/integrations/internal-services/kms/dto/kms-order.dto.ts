import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';

export class KmsOrderItemDto {
  @ApiProperty({ example: 'item-burger-01' })
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ example: 'Signature Wagyu Burger' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 28.5 })
  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Medium-rare, extra pickles' })
  @IsString()
  @IsOptional()
  specialNotes?: string;
}

export class KmsCreateOrderDto {
  @ApiPropertyOptional({ example: 'order-uuid-101' })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ type: [KmsOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KmsOrderItemDto)
  items!: KmsOrderItemDto[];

  @ApiProperty({ example: 57.0 })
  @IsNumber()
  @IsPositive()
  totalAmount!: number;

  @ApiPropertyOptional({ example: 'Severe peanut allergy' })
  @IsString()
  @IsOptional()
  allergyNotes?: string;

  @ApiProperty({ example: 'idemp-key-99887766' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiPropertyOptional({ enum: ContractVersion, default: ContractVersion.V1_0 })
  @IsString()
  @IsOptional()
  version?: string = ContractVersion.V1_0;
}
