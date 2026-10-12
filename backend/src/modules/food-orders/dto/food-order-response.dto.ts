import { FoodOrderStatus } from '../enums/food-order-status.enum.js';

export class FoodOrderResponseDto {
  orderId!: string;
  status!: FoodOrderStatus;
  totalAmount!: number;
  createdAt!: string;
}
