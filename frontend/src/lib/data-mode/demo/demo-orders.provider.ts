import type { OrdersProvider } from '../interfaces.ts';
import type {
  FoodOrderResponse,
  CreateFoodOrderPayload,
  FoodOrderStatus,
} from '../../../types/orders.ts';
import { DemoStateStore } from './demo-state-store.ts';

export class DemoOrdersProvider implements OrdersProvider {
  private readonly store = DemoStateStore.getInstance();

  async fetchGuestOrders(sessionToken?: string): Promise<FoodOrderResponse[]> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.getOrdersForStay(stay.bookingId, stay.roomNumber);
  }

  async fetchGuestOrderById(
    sessionToken: string | undefined,
    orderId: string,
  ): Promise<FoodOrderResponse> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.getOrderById(orderId, stay);
  }

  async placeFoodOrder(
    sessionToken: string | undefined,
    payload: CreateFoodOrderPayload,
    idempotencyKey: string,
  ): Promise<FoodOrderResponse> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.placeOrder(stay, payload, idempotencyKey);
  }

  async cancelFoodOrder(
    sessionToken: string | undefined,
    orderId: string,
    reason?: string,
  ): Promise<FoodOrderResponse> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.cancelOrder(stay, orderId, reason);
  }

  async advanceDemoOrderStatus(
    sessionToken: string,
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<FoodOrderResponse> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.advanceOrderStatus(stay, orderId, newStatus);
  }
}
