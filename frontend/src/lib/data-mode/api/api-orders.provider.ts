import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { OrdersProvider } from '../interfaces.ts';
import type {
  FoodOrderResponse,
  CreateFoodOrderPayload,
  FoodOrderStatus,
} from '../../../types/orders.ts';

function assertRealSessionToken(sessionToken: string, actionDesc: string): void {
  if (!sessionToken || sessionToken.trim() === '') {
    throw new ApiError(`Guest session token is required to ${actionDesc}.`, 401);
  }
  if (
    sessionToken.startsWith('demo-token-') ||
    ['101', '102', '103', '204', '999'].includes(sessionToken)
  ) {
    throw new ApiError(
      'Demonstration session tokens cannot be transmitted to real API endpoints.',
      401,
    );
  }
}

export class ApiOrdersProvider implements OrdersProvider {
  async fetchGuestOrders(sessionToken: string): Promise<FoodOrderResponse[]> {
    assertRealSessionToken(sessionToken, 'fetch orders');

    try {
      const response = await fetch(`${API_URL}/food-orders`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = body?.message || body?.error || 'Failed to fetch guest order history.';
        throw new ApiError(errorMsg, response.status, body);
      }

      if (Array.isArray(body)) {
        return body as FoodOrderResponse[];
      }
      if (body && Array.isArray(body.orders)) {
        return body.orders as FoodOrderResponse[];
      }
      return [];
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to order service.';
      throw new ApiError(msg, 503);
    }
  }

  async fetchGuestOrderById(sessionToken: string, orderId: string): Promise<FoodOrderResponse> {
    assertRealSessionToken(sessionToken, 'fetch order details');

    try {
      const response = await fetch(`${API_URL}/food-orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          body?.message || body?.error || `Order ${orderId} was not found or access was forbidden.`;
        throw new ApiError(errorMsg, response.status, body);
      }

      return body as FoodOrderResponse;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Unable to retrieve order details.';
      throw new ApiError(msg, 503);
    }
  }

  async placeFoodOrder(
    sessionToken: string,
    payload: CreateFoodOrderPayload,
    idempotencyKey: string,
  ): Promise<FoodOrderResponse> {
    assertRealSessionToken(sessionToken, 'place an order');

    const requestBody = {
      items: payload.items,
      allergyNote: payload.allergyNote?.trim() || undefined,
      idempotencyKey,
    };

    try {
      const response = await fetch(`${API_URL}/food-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'Idempotency-Key': idempotencyKey,
          'X-Idempotency-Key': idempotencyKey,
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
      const msg =
        err instanceof Error ? err.message : 'Unable to submit food order due to a network issue.';
      throw new ApiError(msg, 503);
    }
  }

  async cancelFoodOrder(
    sessionToken: string,
    orderId: string,
    reason?: string,
  ): Promise<FoodOrderResponse> {
    assertRealSessionToken(sessionToken, 'cancel an order');

    try {
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
        const errorMsg = body?.message || body?.error || 'Order cannot be cancelled at this time.';
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

  async advanceDemoOrderStatus(
    sessionToken: string,
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<FoodOrderResponse> {
    const response = await fetch(`${API_URL}/food-orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || body?.error || 'Failed to advance demo order status.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as FoodOrderResponse;
  }
}
