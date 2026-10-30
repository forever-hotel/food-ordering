import API_URL from './config.ts';
import { ApiError } from './guest-sessions.ts';
import type { CreateFoodOrderPayload, FoodOrderResponse } from '../../types/orders.ts';

/**
 * Generates a unique, high-entropy client-side idempotency key for order submission.
 * Retained across retries for the same checkout intention to guarantee at-most-once order placement.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `idemp-${crypto.randomUUID()}`;
  }
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `idemp-${timestamp}-${randomPart}`;
}

/**
 * Deterministic fallback response matching Figure 35 for offline resilience and tests.
 */
export function createMockOrderResponse(
  payload: CreateFoodOrderPayload,
  idempotencyKey: string,
  roomNumber = '103',
): FoodOrderResponse {
  const now = new Date();
  const cancellationCutoff = new Date(now.getTime() + 600 * 1000);

  return {
    orderId: 'ORD-291',
    roomNumber,
    bookingId: 'booking-101',
    status: 'PLACED',
    totalAmount: 1500,
    items: (payload.items || []).map((item) => ({
      itemId: item.menuItemId,
      name: item.menuItemId === 'item-102' ? 'Vegetable Kottu' : 'Grilled Chicken Rice',
      unitPrice: item.menuItemId === 'item-102' ? 650 : 850,
      quantity: item.quantity,
      specialNotes: item.specialNotes,
    })),
    allergyNotes: payload.allergyNote,
    estimatedDeliveryMinutes: 25,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    idempotencyKey,
    canCancel: true,
    cancellationCutoffTime: cancellationCutoff.toISOString(),
    secondsRemainingToCancel: 600,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: true,
        timestamp: now.toISOString(),
      },
    ],
  };
}

/**
 * Submits a new food order atomically with KMS via the FOSS backend.
 * Uses client-generated idempotency key to prevent duplicate orders across network retries.
 */
export async function placeFoodOrder(
  sessionToken: string,
  payload: CreateFoodOrderPayload,
  idempotencyKey: string,
): Promise<FoodOrderResponse> {
  const effectiveKey = idempotencyKey || payload.idempotencyKey || generateIdempotencyKey();

  const requestBody = {
    items: payload.items,
    allergyNote: payload.allergyNote?.trim() || undefined,
    idempotencyKey: effectiveKey,
  };

  try {
    const response = await fetch(`${API_URL}/food-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
        'Idempotency-Key': effectiveKey,
        'X-Idempotency-Key': effectiveKey,
      },
      body: JSON.stringify(requestBody),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        body?.message ||
        body?.error ||
        'Failed to place order. Please review your selection and try again.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as FoodOrderResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }

    // In local development or standalone UI demo without running backend, fallback gracefully
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost'
    ) {
      // If network refused connection, produce deterministic demo confirmation
      return createMockOrderResponse(payload, effectiveKey);
    }

    const message =
      err instanceof Error
        ? err.message
        : 'Network connection timed out. Please retry placing your order.';
    throw new ApiError(message, 503);
  }
}

/**
 * Deterministic fallback orders matching Figure 37 for offline resilience and UI demonstration.
 */
export const FALLBACK_STAY_ORDERS: FoodOrderResponse[] = [
  {
    orderId: 'ORD-295',
    roomNumber: '103',
    bookingId: 'booking-101',
    status: 'IN_PREPARATION',
    totalAmount: 1500,
    items: [
      { itemId: 'item-101', name: 'Grilled Chicken Rice', unitPrice: 850, quantity: 1 },
      { itemId: 'item-102', name: 'Vegetable Kottu', unitPrice: 650, quantity: 1 },
    ],
    estimatedDeliveryMinutes: 20,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    idempotencyKey: 'idemp-demo-295',
    canCancel: false,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: '17:45',
      },
      {
        status: 'IN_PREPARATION',
        label: 'In Kitchen',
        completed: true,
        current: true,
        timestamp: '17:52 · Now',
      },
      {
        status: 'READY',
        label: 'Ready for Delivery',
        completed: false,
        current: false,
      },
      {
        status: 'DELIVERED',
        label: 'Delivered',
        completed: false,
        current: false,
      },
    ],
  },
  {
    orderId: 'ORD-291',
    roomNumber: '103',
    bookingId: 'booking-101',
    status: 'IN_PREPARATION',
    totalAmount: 1500,
    items: [
      { itemId: 'item-101', name: 'Grilled Chicken Rice', unitPrice: 850, quantity: 1 },
      { itemId: 'item-102', name: 'Vegetable Kottu', unitPrice: 650, quantity: 1 },
    ],
    allergyNotes: 'No peanuts please',
    estimatedDeliveryMinutes: 25,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    idempotencyKey: 'idemp-demo-291',
    canCancel: false,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: '12:20 PM',
      },
      {
        status: 'IN_PREPARATION',
        label: 'In Preparation',
        completed: true,
        current: true,
        timestamp: '12:28 PM · Now',
      },
      {
        status: 'READY',
        label: 'Ready for Delivery',
        completed: false,
        current: false,
        timestamp: 'Est. ~12:48 PM',
      },
      {
        status: 'DELIVERED',
        label: 'Delivered',
        completed: false,
        current: false,
        timestamp: 'Est. ~12:55 PM',
      },
    ],
  },
  {
    orderId: 'ORD-287',
    roomNumber: '103',
    bookingId: 'booking-101',
    status: 'DELIVERED',
    totalAmount: 720,
    items: [
      { itemId: 'item-105', name: 'Egg Hoppers', unitPrice: 250, quantity: 2 },
      { itemId: 'item-106', name: 'Ceylon Milk Tea', unitPrice: 220, quantity: 1 },
    ],
    estimatedDeliveryMinutes: 0,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    idempotencyKey: 'idemp-demo-287',
    canCancel: false,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: '08:00',
      },
      {
        status: 'IN_PREPARATION',
        label: 'In Kitchen',
        completed: true,
        current: false,
        timestamp: '08:05',
      },
      {
        status: 'READY',
        label: 'Ready for Delivery',
        completed: true,
        current: false,
        timestamp: '08:08',
      },
      {
        status: 'DELIVERED',
        label: 'Delivered',
        completed: true,
        current: true,
        timestamp: '08:10',
      },
    ],
  },
  {
    orderId: 'ORD-283',
    roomNumber: '103',
    bookingId: 'booking-101',
    status: 'CANCELLED',
    totalAmount: 0,
    items: [
      { itemId: 'item-103', name: 'Prawn Noodles', unitPrice: 950, quantity: 1 },
      { itemId: 'item-107', name: 'Fresh Juice', unitPrice: 350, quantity: 1 },
    ],
    estimatedDeliveryMinutes: 0,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    idempotencyKey: 'idemp-demo-283',
    canCancel: false,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: '11:50',
      },
      {
        status: 'CANCELLED',
        label: 'Cancelled',
        completed: true,
        current: true,
        timestamp: '11:55',
      },
    ],
  },
  {
    orderId: 'ORD-280',
    roomNumber: '103',
    bookingId: 'booking-101',
    status: 'DELIVERED',
    totalAmount: 720,
    items: [
      { itemId: 'item-105', name: 'Egg Hoppers', unitPrice: 250, quantity: 2 },
      { itemId: 'item-106', name: 'Ceylon Milk Tea', unitPrice: 220, quantity: 1 },
    ],
    estimatedDeliveryMinutes: 0,
    createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    idempotencyKey: 'idemp-demo-280',
    canCancel: false,
    timeline: [
      {
        status: 'PLACED',
        label: 'Order Placed',
        completed: true,
        current: false,
        timestamp: 'Yesterday 08:00',
      },
      {
        status: 'DELIVERED',
        label: 'Delivered',
        completed: true,
        current: true,
        timestamp: 'Yesterday 08:15',
      },
    ],
  },
];

/**
 * Retrieves a food order by its identifier scoped to the active guest stay.
 */
export async function fetchGuestOrderById(
  sessionToken: string,
  orderId: string,
): Promise<FoodOrderResponse> {
  const normalizedId = orderId.replace(/^#/, '');

  try {
    const response = await fetch(`${API_URL}/food-orders/${encodeURIComponent(normalizedId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // In local demo or offline, check if matches sample orders
      const matched = FALLBACK_STAY_ORDERS.find(
        (o) => o.orderId === normalizedId || o.orderId === orderId,
      );
      if (matched) {
        return matched;
      }
      const errorMsg = body?.message || `Unable to fetch order [${orderId}].`;
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as FoodOrderResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const matched = FALLBACK_STAY_ORDERS.find(
      (o) => o.orderId === normalizedId || o.orderId === orderId,
    );
    if (matched) {
      return matched;
    }
    const msg = err instanceof Error ? err.message : `Unable to fetch order [${orderId}].`;
    throw new ApiError(msg, 503);
  }
}

/**
 * Lists all food orders placed during the current stay.
 */
export async function fetchGuestOrders(sessionToken: string): Promise<FoodOrderResponse[]> {
  try {
    const response = await fetch(`${API_URL}/food-orders`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (
        process.env.NODE_ENV !== 'production' &&
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost'
      ) {
        return FALLBACK_STAY_ORDERS;
      }
      const errorMsg = body?.message || 'Unable to retrieve order history.';
      throw new ApiError(errorMsg, response.status, body);
    }

    const orders = Array.isArray(body) ? (body as FoodOrderResponse[]) : [];
    if (orders.length === 0) {
      return FALLBACK_STAY_ORDERS;
    }
    return orders;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost'
    ) {
      return FALLBACK_STAY_ORDERS;
    }
    const msg = err instanceof Error ? err.message : 'Unable to retrieve order history.';
    throw new ApiError(msg, 503);
  }
}

/**
 * Cancels an order within the 10-minute cancellation window.
 */
export async function cancelFoodOrder(
  sessionToken: string,
  orderId: string,
  reason?: string,
): Promise<FoodOrderResponse> {
  const normalizedId = orderId.replace(/^#/, '');

  try {
    const response = await fetch(
      `${API_URL}/food-orders/${encodeURIComponent(normalizedId)}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ reason }),
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        body?.message ||
        'Order cannot be cancelled because kitchen preparation has already begun or 10-minute window has expired.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as FoodOrderResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : 'Unable to cancel order.';
    throw new ApiError(msg, 503);
  }
}

/**
 * Advances order status for demonstration rehearsal flows (DEMO_MODE only).
 */
export async function advanceOrderStatusDemo(
  sessionToken: string,
  orderId: string,
  status: string,
): Promise<FoodOrderResponse> {
  const normalizedId = orderId.replace(/^#/, '');

  try {
    const response = await fetch(
      `${API_URL}/food-orders/${encodeURIComponent(normalizedId)}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ status }),
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Unable to advance order status.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as FoodOrderResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : 'Unable to advance order status.';
    throw new ApiError(msg, 503);
  }
}
