import type {
  CreateFoodOrderPayload,
  FoodOrderResponse,
  FoodOrderStatus,
} from '../../types/orders.ts';
import { ApiError } from '../data-mode/api-error.ts';
import { isOrderDemoSimulationEnabled } from '../data-mode/data-mode.ts';
import { getOrdersProvider } from '../data-mode/provider-factory.ts';
import { FALLBACK_MENU_RESPONSE } from './menu.ts';
import { calculateLineTotal, roundMoney } from '../utils/money.ts';

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
 * Calculates totalAmount dynamically from validated item line totals to prevent misrepresenting actual orders.
 */
export function createMockOrderResponse(
  payload: CreateFoodOrderPayload,
  idempotencyKey: string,
  roomNumber = '103',
): FoodOrderResponse {
  const now = new Date();
  const cancellationCutoff = new Date(now.getTime() + 600 * 1000);

  const validatedItems = (payload.items || []).map((item) => {
    const catalogItem = FALLBACK_MENU_RESPONSE.items.find((m) => m.id === item.menuItemId);
    const unitPrice = catalogItem ? catalogItem.price : item.menuItemId === 'item-102' ? 650 : 850;
    const name = catalogItem
      ? catalogItem.name
      : item.menuItemId === 'item-102'
        ? 'Vegetable Kottu'
        : 'Grilled Chicken Rice';

    return {
      itemId: item.menuItemId,
      name,
      unitPrice,
      quantity: item.quantity,
      specialNotes: item.specialNotes,
    };
  });

  const totalAmount = validatedItems.reduce(
    (sum, item) => roundMoney(sum + calculateLineTotal(item.unitPrice, item.quantity)),
    0,
  );

  return {
    orderId: 'ORD-291',
    roomNumber,
    bookingId: 'booking-101',
    status: 'PLACED',
    totalAmount,
    items: validatedItems,
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
  sessionToken: string | undefined,
  payload: CreateFoodOrderPayload,
  idempotencyKey: string,
): Promise<FoodOrderResponse> {
  const effectiveKey = idempotencyKey || payload.idempotencyKey || generateIdempotencyKey();
  return getOrdersProvider().placeFoodOrder(sessionToken, payload, effectiveKey);
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
  sessionToken: string | undefined,
  orderId: string,
): Promise<FoodOrderResponse> {
  const normalizedId = orderId.replace(/^#/, '');
  return getOrdersProvider().fetchGuestOrderById(sessionToken, normalizedId);
}

/**
 * Lists all food orders placed during the current stay.
 */
export async function fetchGuestOrders(sessionToken?: string): Promise<FoodOrderResponse[]> {
  return getOrdersProvider().fetchGuestOrders(sessionToken);
}

/**
 * Cancels an order within the 10-minute cancellation window.
 */
export async function cancelFoodOrder(
  sessionToken: string | undefined,
  orderId: string,
  reason?: string,
): Promise<FoodOrderResponse> {
  const normalizedId = orderId.replace(/^#/, '');
  return getOrdersProvider().cancelFoodOrder(sessionToken, normalizedId, reason);
}

/**
 * Advances order status for demonstration rehearsal flows (explicit non-production dev flag only).
 */
export async function advanceOrderStatusDemo(
  sessionToken: string,
  orderId: string,
  status: string,
): Promise<FoodOrderResponse> {
  if (!isOrderDemoSimulationEnabled()) {
    throw new ApiError('Order demo status simulation is disabled in this environment.', 403);
  }
  const normalizedId = orderId.replace(/^#/, '');
  return getOrdersProvider().advanceDemoOrderStatus(
    sessionToken,
    normalizedId,
    status as FoodOrderStatus,
  );
}

export async function advanceDemoOrderStatus(
  sessionToken: string,
  orderId: string,
  newStatus: FoodOrderStatus,
): Promise<FoodOrderResponse> {
  if (!isOrderDemoSimulationEnabled()) {
    throw new ApiError('Order demo status simulation is disabled in this environment.', 403);
  }
  const normalizedId = orderId.replace(/^#/, '');
  return getOrdersProvider().advanceDemoOrderStatus(sessionToken, normalizedId, newStatus);
}

export const STATUS_RANK: Record<string, number> = {
  PLACED: 1,
  IN_PREPARATION: 2,
  READY: 3,
  DELIVERED: 4,
  CANCELLED: 4,
};

/**
 * Reconciles an authoritative order-history response from the backend.
 *
 * Rules:
 * 1. An authoritative empty response (`incoming.length === 0`) clears stale history.
 * 2. Only orders present in `incoming` are retained (orders that no longer belong to the stay are dropped).
 * 3. Status monotonicity: if a local order was advanced (e.g. DELIVERED via real-time SSE)
 *    and a delayed in-flight polling response contains an older status (e.g. IN_PREPARATION)
 *    with `incomingTime <= existingTime`, the more advanced status is preserved.
 * 4. Explicit status corrections or server updates with `incomingTime > existingTime` or
 *    cancellation take precedence from the authoritative server response.
 * 5. Orders are sorted descending by `createdAt`.
 */
export function reconcileAuthoritativeOrders(
  current: FoodOrderResponse[],
  incoming: FoodOrderResponse[],
): FoodOrderResponse[] {
  if (!incoming || incoming.length === 0) {
    return [];
  }

  const currentMap = new Map<string, FoodOrderResponse>();
  for (const o of current) {
    currentMap.set(o.orderId, o);
  }

  const result: FoodOrderResponse[] = [];

  for (const inc of incoming) {
    const existing = currentMap.get(inc.orderId);
    if (!existing) {
      result.push(inc);
      continue;
    }

    const existingRank = STATUS_RANK[existing.status] || 0;
    const incomingRank = STATUS_RANK[inc.status] || 0;

    const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const incomingTime = inc.updatedAt ? new Date(inc.updatedAt).getTime() : 0;

    // If local state is at a higher progress rank and incoming response does not have a newer timestamp,
    // prevent delayed polling from regressing the advanced status.
    if (existingRank > incomingRank && incomingTime <= existingTime) {
      result.push(existing);
      continue;
    }

    result.push(inc);
  }

  return result.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Applies an incremental real-time SSE status update to the current order list.
 *
 * Rules:
 * 1. If the order exists, it is updated unless the update is an older out-of-order event.
 * 2. If the order does not exist, it is prepended.
 * 3. Preserves sorting by `createdAt` descending.
 */
export function applyIncrementalOrderUpdate(
  current: FoodOrderResponse[],
  update: FoodOrderResponse,
): FoodOrderResponse[] {
  if (!update || !update.orderId) {
    return current;
  }

  const existingIndex = current.findIndex((o) => o.orderId === update.orderId);

  if (existingIndex < 0) {
    // New order for this stay, prepend and sort
    return [update, ...current].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  const existing = current[existingIndex];
  const existingRank = STATUS_RANK[existing.status] || 0;
  const updateRank = STATUS_RANK[update.status] || 0;

  const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const updateTime = update.updatedAt ? new Date(update.updatedAt).getTime() : 0;

  // Reject out-of-order SSE event that has lower rank and older/equal timestamp
  if (existingRank > updateRank && updateTime <= existingTime) {
    return current;
  }

  const next = [...current];
  next[existingIndex] = update;
  return next.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Merges newly received order updates with the current order list.
 * Defaults to authoritative reconciliation when receiving full order arrays.
 */
export function mergeOrders(
  current: FoodOrderResponse[],
  incoming: FoodOrderResponse[],
  options?: { isAuthoritative?: boolean },
): FoodOrderResponse[] {
  const isAuthoritative = options?.isAuthoritative ?? true;
  if (isAuthoritative) {
    return reconcileAuthoritativeOrders(current, incoming);
  }

  let acc = [...current];
  for (const inc of incoming) {
    acc = applyIncrementalOrderUpdate(acc, inc);
  }
  return acc;
}
