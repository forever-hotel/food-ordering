import { describe, expect, it, jest } from '@jest/globals';
import { DataSource } from 'typeorm';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import {
  SharedFoodOrderRepository,
  kitchenOrderId,
} from './shared-food-order.repository.js';

describe('canonical shared kitchen orders', () => {
  it('uses the same stable UUIDv5 identity as KMS', () => {
    expect(kitchenOrderId('6d8e0fd2-168e-4d76-a1be-819eb45f8fc2')).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
    expect(kitchenOrderId('same')).toBe(kitchenOrderId('same'));
    expect(kitchenOrderId('same')).not.toBe(kitchenOrderId('different'));
  });

  it('survives repository recreation and returns current owner state in rupees without writing', async () => {
    const query = jest.fn<() => Promise<unknown[]>>();
    const row = {
      order_id: 'id',
      booking_id: 'booking',
      room_number: '101',
      status: 'READY',
      total_amount: 125050,
      placed_at: new Date(),
      updated_at: new Date(),
    };
    query
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        { menu_item_id: 'item', name: 'Rice', quantity: 1, unit_price: 125050 },
      ]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);
    expect(
      await repo.save(
        Object.assign(new FossDemoOrder(), {
          orderId: 'id',
          idempotencyKey: 'key',
        }),
      ),
    ).toMatchObject({
      status: 'READY',
      totalAmount: 1250.5,
      items: [{ unitPrice: 1250.5 }],
      idempotencyKey: 'key',
    });
    expect(
      query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT')),
    ).toBe(true);
  });

  it('scopes history to the verified booking and room', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);
    expect(await repo.findByBookingAndRoom('booking', '101')).toEqual([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('booking_id = $1 AND room_number = $2'),
      ['booking', '101'],
    );
  });
});
