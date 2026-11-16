export type FoodOrderStatus = 'PLACED' | 'IN_PREPARATION' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface CreateFoodOrderItemPayload {
  menuItemId: string;
  quantity: number;
  specialNotes?: string;
}

export interface CreateFoodOrderPayload {
  items: CreateFoodOrderItemPayload[];
  allergyNote?: string;
  idempotencyKey?: string;
}

export interface FoodOrderItemResponse {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  specialNotes?: string;
}

export interface OrderTimelineStep {
  status: FoodOrderStatus;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
}

export interface FoodOrderResponse {
  orderId: string;
  roomNumber: string;
  bookingId: string;
  status: FoodOrderStatus;
  totalAmount: number;
  items: FoodOrderItemResponse[];
  allergyNotes?: string;
  estimatedDeliveryMinutes: number;
  createdAt: string;
  updatedAt?: string;
  idempotencyKey: string;
  canCancel?: boolean;
  cancellationCutoffTime?: string;
  secondsRemainingToCancel?: number;
  timeline?: OrderTimelineStep[];
}
