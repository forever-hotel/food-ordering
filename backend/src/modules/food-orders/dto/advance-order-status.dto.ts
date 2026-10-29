import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';

export class AdvanceOrderStatusDto {
  @ApiProperty({
    enum: FoodOrderStatus,
    example: FoodOrderStatus.IN_PREPARATION,
    description: 'Target lifecycle status for deterministic demo flow',
  })
  @IsEnum(FoodOrderStatus)
  status!: FoodOrderStatus;
}
