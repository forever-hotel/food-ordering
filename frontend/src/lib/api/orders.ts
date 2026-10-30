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
 * Retrieves a food order by its identifier scoped to the active guest stay.
 */
export async function fetchGuestOrderById(
  sessionToken: string,
  orderId: string,
): Promise<FoodOrderResponse> {
  const response = await fetch(`${API_URL}/food-orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.message || `Unable to fetch order [${orderId}].`;
    throw new ApiError(errorMsg, response.status, body);
  }

  return body as FoodOrderResponse;
}

/**
 * Lists all food orders placed during the current stay.
 */
export async function fetchGuestOrders(sessionToken: string): Promise<FoodOrderResponse[]> {
  const response = await fetch(`${API_URL}/food-orders`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.message || 'Unable to retrieve order history.';
    throw new ApiError(errorMsg, response.status, body);
  }

  return body as FoodOrderResponse[];
}

/**
 * Cancels an order within the 10-minute cancellation window.
 */
export async function cancelFoodOrder(
  sessionToken: string,
  orderId: string,
  reason?: string,
): Promise<FoodOrderResponse> {
  const response = await fetch(`${API_URL}/food-orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ reason }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.message || 'Unable to cancel order.';
    throw new ApiError(errorMsg, response.status, body);
  }

  return body as FoodOrderResponse;
}
