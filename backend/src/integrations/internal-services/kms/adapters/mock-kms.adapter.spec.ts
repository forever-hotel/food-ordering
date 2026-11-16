import { beforeEach, describe, expect, it } from '@jest/globals';
import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { MealPeriod } from '../dto/kms-menu.dto.js';
import { KMS_FIXTURE_CREATE_ORDER_VALID } from '../fixtures/kms-contract.fixtures.js';
import { MockKmsAdapter } from './mock-kms.adapter.js';

describe('MockKmsAdapter', () => {
  let adapter: MockKmsAdapter;

  beforeEach(() => {
    adapter = new MockKmsAdapter();
  });

  it('retrieves the full menu catalog for ALL_DAY or default period', async () => {
    const catalog = await adapter.getMenuCatalog();
    expect(catalog.version).toBe('1.0');
    expect(catalog.categories).toContain('Mains');
    expect(catalog.items.length).toBeGreaterThan(0);
  });

  it('filters menu catalog items by meal period correctly', async () => {
    const breakfastCatalog = await adapter.getMenuCatalog(MealPeriod.BREAKFAST);
    expect(
      breakfastCatalog.items.every((item) =>
        item.mealPeriods.includes(MealPeriod.BREAKFAST),
      ),
    ).toBe(true);
    expect(breakfastCatalog.categories).toContain('Mains');
  });

  it('creates an order successfully and tracks deterministic state', async () => {
    const newOrder = await adapter.createOrder({
      ...KMS_FIXTURE_CREATE_ORDER_VALID,
      idempotencyKey: 'fresh-key-1234',
    });

    expect(newOrder.orderId).toBeDefined();
    expect(newOrder.status).toBe(FoodOrderStatus.PLACED);
    expect(newOrder.roomNumber).toBe('101');
    expect(newOrder.totalAmount).toBe(73.5);

    const fetched = await adapter.getOrder(newOrder.orderId);
    expect(fetched).toEqual(newOrder);
  });

  it('replays existing order when identical idempotency key is submitted', async () => {
    const key = 'test-idemp-replay-key';
    const firstCall = await adapter.createOrder({
      ...KMS_FIXTURE_CREATE_ORDER_VALID,
      idempotencyKey: key,
    });

    const secondCall = await adapter.createOrder({
      ...KMS_FIXTURE_CREATE_ORDER_VALID,
      idempotencyKey: key,
    });

    expect(secondCall.orderId).toBe(firstCall.orderId);
    expect(secondCall.createdAt).toBe(firstCall.createdAt);
  });

  it('transitions order through lifecycle stages and updates estimates', async () => {
    const orderId = 'order-fixture-001';

    const inPrep = adapter.transitionStatus(
      orderId,
      FoodOrderStatus.IN_PREPARATION,
    );
    expect(inPrep.status).toBe(FoodOrderStatus.IN_PREPARATION);

    const ready = adapter.transitionStatus(orderId, FoodOrderStatus.READY);
    expect(ready.status).toBe(FoodOrderStatus.READY);
    expect(ready.estimatedDeliveryMinutes).toBe(5);

    const delivered = adapter.transitionStatus(
      orderId,
      FoodOrderStatus.DELIVERED,
    );
    expect(delivered.status).toBe(FoodOrderStatus.DELIVERED);
    expect(delivered.estimatedDeliveryMinutes).toBe(0);
  });

  it('cancels an active order successfully', async () => {
    const orderId = 'order-fixture-001';
    const cancelled = await adapter.cancelOrder(orderId, 'Guest changed mind');

    expect(cancelled.status).toBe(FoodOrderStatus.CANCELLED);
  });

  it('throws an error if attempting to cancel a delivered order', async () => {
    const orderId = 'order-fixture-001';
    adapter.transitionStatus(orderId, FoodOrderStatus.DELIVERED);

    await expect(adapter.cancelOrder(orderId)).rejects.toThrow(
      'cannot be cancelled because it has already been delivered',
    );
  });

  it('simulates upstream down outage when flag is active', async () => {
    adapter.setSimulateDown(true);
    await expect(adapter.getMenuCatalog()).rejects.toThrow(
      'simulated connection refusal',
    );
  });

  it('simulates upstream timeout when flag is active', async () => {
    adapter.setSimulateTimeout(true);
    await expect(adapter.getOrder('order-fixture-001')).rejects.toThrow(
      'timed out after 5000ms',
    );
  });

  it('resets state to default seeded fixture on reset()', async () => {
    adapter.setSimulateDown(true);
    adapter.reset();

    const order = await adapter.getOrder('order-fixture-001');
    expect(order).toBeDefined();
    expect(order?.status).toBe(FoodOrderStatus.PLACED);
  });
});
