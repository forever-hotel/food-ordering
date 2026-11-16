import { FoodOrderStatus } from '../enums/food-order-status.enum.js';

export interface FoodOrderStatusUpdatedEvent {
  orderId: string;
  roomNumber: string;
  status: FoodOrderStatus;
  occurredAt: string;
}
