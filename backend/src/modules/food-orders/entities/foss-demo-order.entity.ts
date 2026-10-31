import { FoodOrderStatus } from '../enums/food-order-status.enum.js';
import type { FossDemoOrderItem } from './foss-demo-order-item.entity.js';

/**
 * In-memory demonstration food order projection model.
 *
 * NOTE: In accordance with ADR-003, KMS owns canonical food orders (kms_food_orders).
 * FOSS does not persist demo food orders in the shared database. This class is maintained
 * purely in-memory for local development and test scenarios.
 */
export class FossDemoOrder {
  orderId!: string;

  bookingId!: string;

  roomNumber!: string;

  status: FoodOrderStatus = FoodOrderStatus.PLACED;

  totalAmount!: number;

  allergyNotes?: string | null;

  idempotencyKey!: string;

  estimatedDeliveryMinutes: number = 25;

  createdAt!: Date;

  updatedAt!: Date;

  items!: FossDemoOrderItem[];
}
