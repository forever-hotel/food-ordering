import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';

export class FoodOrderItemResponseDto {
  @ApiProperty({ example: 'menu-item-001' })
  itemId!: string;

  @ApiProperty({ example: 'Truffle Mushroom Arancini' })
  name!: string;

  @ApiProperty({ example: 14.5 })
  unitPrice!: number;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiPropertyOptional({ example: 'Extra crispy' })
  specialNotes?: string;
}

export class FoodOrderResponseDto {
  @ApiProperty({ example: 'order-kms-1730180000000-123' })
  orderId!: string;

  @ApiProperty({ example: '101' })
  roomNumber!: string;

  @ApiProperty({ example: 'booking-101' })
  bookingId!: string;

  @ApiProperty({ enum: FoodOrderStatus, example: FoodOrderStatus.PLACED })
  status!: FoodOrderStatus;

  @ApiProperty({ example: 29.0 })
  totalAmount!: number;

  @ApiProperty({ type: [FoodOrderItemResponseDto] })
  items!: FoodOrderItemResponseDto[];

  @ApiPropertyOptional({ example: 'No nuts please' })
  allergyNotes?: string;

  @ApiProperty({
    example: 25,
    description: 'Estimated preparation and delivery time in minutes',
  })
  estimatedDeliveryMinutes!: number;

  @ApiProperty({ example: '2026-10-29T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-10-29T12:00:00.000Z' })
  updatedAt?: string;

  @ApiProperty({ example: 'idemp-550e8400-e29b-41d4-a716-446655440000' })
  idempotencyKey!: string;
}
