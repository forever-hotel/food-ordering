import { describe, expect, it, jest } from '@jest/globals';
import { DataSource } from 'typeorm';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import { kitchenIdempotencyKey } from '../../../integrations/internal-services/kms/adapters/kms-idempotency.js';
import {
  SharedFoodOrderRepository,
  kitchenOrderId,
} from './shared-food-order.repository.js';

describe('canonical shared kitchen orders', () => {
  it('recovers the canonical order using the exact key sent to KMS', async () => {
    const key = 'idemp-d0652c4a-607a-48f9-b12b-e052b198409f';
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValueOnce([
        {
          order_id: 'order',
          booking_id: 'booking',
          room_number: '101',
          status: 'READY',
          total_amount: 180000,
          placed_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);
    const order = await repo.findByIdempotencyKey(key, 'booking');
    expect(query.mock.calls[0]?.[1]).toEqual([
      kitchenOrderId(kitchenIdempotencyKey('booking', key)),
    ]);
    expect(order).toMatchObject({ status: 'READY', idempotencyKey: key });
  });
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

  it('returns null when order is not found by ID', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);

    const result = await repo.findById('non-existent-id');
    expect(result).toBeNull();
  });

  it('returns null when order is not found by idempotency key', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);

    const result = await repo.findByIdempotencyKey('non-existent-key');
    expect(result).toBeNull();
  });

  it('filters out null orders in findByBookingAndRoom', async () => {
    const query = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
    query.mockResolvedValueOnce([{ order_id: 'id-1' }, { order_id: 'id-2' }]);
    // id-1 found
    query.mockResolvedValueOnce([
      {
        order_id: 'id-1',
        booking_id: 'booking',
        room_number: '101',
        status: 'PLACED',
        total_amount: 50000,
        placed_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    query.mockResolvedValueOnce([]); // items for id-1
    // id-2 not found
    query.mockResolvedValueOnce([]);

    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);

    const results = await repo.findByBookingAndRoom('booking', '101');
    expect(results).toHaveLength(1);
    expect(results[0].orderId).toBe('id-1');
  });

  it('throws NotFoundException when saving an uncommitted or nonexistent order', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    const repo = new SharedFoodOrderRepository({
      query,
    } as unknown as DataSource);

    const order = new FossDemoOrder();
    order.orderId = 'missing-id';

    await expect(repo.save(order)).rejects.toThrow(
      'Canonical kitchen order is unavailable',
    );
  });
});
