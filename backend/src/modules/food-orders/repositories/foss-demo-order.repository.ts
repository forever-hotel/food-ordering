import { Injectable, Logger } from '@nestjs/common';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';

/**
 * In-memory repository for demonstration food orders.
 *
 * NOTE: In accordance with Organization ADR-003, KMS (Kitchen Management System) is the sole
 * authoritative owner of food orders (kms_food_orders). FOSS maintains demonstration food order
 * state purely in-memory for local development, demo flows, and automated testing.
 *
 * PERSISTENCE LIFECYCLE:
 * - Orders remain in memory across API requests while the NestJS backend process is running.
 * - Demonstration orders reset and disappear when the backend service restarts.
 * - Canonical food ordering in production is delegated directly to KMS via RealKmsAdapter.
 */
@Injectable()
export class FossDemoOrderRepository {
  private readonly logger = new Logger(FossDemoOrderRepository.name);
  private readonly orders: Map<string, FossDemoOrder> = new Map();

  public async findById(orderId: string): Promise<FossDemoOrder | null> {
    const order = this.orders.get(orderId);
    return order ? this.clone(order) : null;
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FossDemoOrder | null> {
    for (const order of this.orders.values()) {
      if (order.idempotencyKey === idempotencyKey) {
        return this.clone(order);
      }
    }
    return null;
  }

  public async findByBookingAndRoom(
    bookingId: string,
    roomNumber: string,
  ): Promise<FossDemoOrder[]> {
    const results: FossDemoOrder[] = [];
    for (const order of this.orders.values()) {
      if (order.bookingId === bookingId && order.roomNumber === roomNumber) {
        results.push(this.clone(order));
      }
    }
    return results.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  public async save(order: FossDemoOrder): Promise<FossDemoOrder> {
    if (!order.orderId) {
      throw new Error('Cannot save an order without an orderId.');
    }

    // Check for duplicate idempotency key on a different orderId (simulate unique constraint)
    for (const existing of this.orders.values()) {
      if (
        existing.idempotencyKey === order.idempotencyKey &&
        existing.orderId !== order.orderId
      ) {
        const error = new Error(
          `duplicate key value violates unique constraint "UQ_foss_demo_orders_idempotency_key"`,
        ) as Error & { code?: string };
        error.code = '23505';
        throw error;
      }
    }

    const cloned = this.clone(order);
    this.orders.set(order.orderId, cloned);
    return this.clone(cloned);
  }

  /**
   * Resets only orders matching authorized demonstration booking IDs,
   * preventing destruction of unrelated sessions in shared development environments.
   */
  public resetScopedOrders(authorizedBookingIds: Set<string>): number {
    let clearedCount = 0;
    for (const [orderId, order] of this.orders.entries()) {
      if (authorizedBookingIds.has(order.bookingId)) {
        this.orders.delete(orderId);
        clearedCount++;
      }
    }
    return clearedCount;
  }

  /**
   * Resets the in-memory state cleanly for unit and integration testing.
   */
  public reset(): void {
    this.orders.clear();
  }

  private clone(order: FossDemoOrder): FossDemoOrder {
    const copy = Object.assign(new FossDemoOrder(), order);
    if (order.items) {
      copy.items = order.items.map((i) => Object.assign({}, i));
    }
    return copy;
  }
}
