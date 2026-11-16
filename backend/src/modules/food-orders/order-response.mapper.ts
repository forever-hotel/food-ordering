import {
  FoodOrderItemResponseDto,
  FoodOrderResponseDto,
  OrderTimelineStepDto,
} from './dto/food-order-response.dto.js';
import { FossDemoOrder } from './entities/foss-demo-order.entity.js';
import { FoodOrderStatus } from './enums/food-order-status.enum.js';

/**
 * Pure mapper that converts an order projection into the guest-facing FoodOrderResponseDto
 * with authoritative 10-minute cancellation window calculations and timeline steps.
 */
export function mapFoodOrderToResponse(
  order: FossDemoOrder,
  currentClock: Date,
  referenceTime?: Date,
): FoodOrderResponseDto {
  const now = referenceTime || currentClock;
  let createdAtDate: Date;
  if (order.createdAt instanceof Date && !isNaN(order.createdAt.getTime())) {
    createdAtDate = order.createdAt;
  } else if (order.createdAt) {
    const parsed = new Date(order.createdAt);
    createdAtDate = isNaN(parsed.getTime()) ? now : parsed;
  } else {
    createdAtDate = now;
  }

  let updatedAtDate: Date;
  if (order.updatedAt instanceof Date && !isNaN(order.updatedAt.getTime())) {
    updatedAtDate = order.updatedAt;
  } else if (order.updatedAt) {
    const parsed = new Date(order.updatedAt);
    updatedAtDate = isNaN(parsed.getTime()) ? now : parsed;
  } else {
    updatedAtDate = now;
  }

  const elapsedSeconds = Math.floor(
    (now.getTime() - createdAtDate.getTime()) / 1000,
  );

  const withinWindow = elapsedSeconds < 600;
  const canCancel = order.status === FoodOrderStatus.PLACED && withinWindow;
  const cancellationCutoffTime = new Date(
    createdAtDate.getTime() + 600 * 1000,
  ).toISOString();
  const secondsRemainingToCancel = canCancel
    ? Math.max(0, 600 - elapsedSeconds)
    : 0;

  const items: FoodOrderItemResponseDto[] = (order.items || []).map((i) => ({
    itemId: i.menuItemId,
    name: i.name,
    unitPrice: Number(i.unitPrice),
    quantity: i.quantity,
    specialNotes: i.specialNotes ?? undefined,
  }));

  return {
    orderId: order.orderId,
    roomNumber: order.roomNumber,
    bookingId: order.bookingId,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    items,
    allergyNotes: order.allergyNotes ?? undefined,
    estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
    createdAt: createdAtDate.toISOString(),
    updatedAt: updatedAtDate.toISOString(),
    idempotencyKey: order.idempotencyKey,
    canCancel,
    cancellationCutoffTime,
    secondsRemainingToCancel,
    timeline: buildFoodOrderTimeline(
      order,
      currentClock,
      createdAtDate,
      updatedAtDate,
    ),
  };
}

/**
 * Builds the canonical 4-stage (or cancelled) order progress timeline.
 */
export function buildFoodOrderTimeline(
  order: FossDemoOrder,
  currentClock: Date,
  createdAtDate?: Date,
  updatedAtDate?: Date,
): OrderTimelineStepDto[] {
  const cDate =
    createdAtDate ||
    (order.createdAt instanceof Date && !isNaN(order.createdAt.getTime())
      ? order.createdAt
      : currentClock);
  const uDate =
    updatedAtDate ||
    (order.updatedAt instanceof Date && !isNaN(order.updatedAt.getTime())
      ? order.updatedAt
      : currentClock);
  const createdAtIso = cDate.toISOString();
  const updatedAtIso = uDate.toISOString();

  if (order.status === FoodOrderStatus.CANCELLED) {
    return [
      {
        status: FoodOrderStatus.PLACED,
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: createdAtIso,
      },
      {
        status: FoodOrderStatus.CANCELLED,
        label: 'Cancelled',
        completed: true,
        current: true,
        timestamp: updatedAtIso,
      },
    ];
  }

  const steps = [
    { status: FoodOrderStatus.PLACED, label: 'Order Placed' },
    { status: FoodOrderStatus.IN_PREPARATION, label: 'In Kitchen' },
    { status: FoodOrderStatus.READY, label: 'Ready for Delivery' },
    { status: FoodOrderStatus.DELIVERED, label: 'Delivered to Room' },
  ];

  const statusHierarchy = [
    FoodOrderStatus.PLACED,
    FoodOrderStatus.IN_PREPARATION,
    FoodOrderStatus.READY,
    FoodOrderStatus.DELIVERED,
  ];

  const currentIndex = statusHierarchy.indexOf(order.status);

  return steps.map((step, idx) => ({
    status: step.status,
    label: step.label,
    completed: idx <= currentIndex,
    current: idx === currentIndex,
    timestamp:
      idx === 0
        ? createdAtIso
        : idx === currentIndex
          ? updatedAtIso
          : undefined,
  }));
}
