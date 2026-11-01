import { beforeEach, describe, expect, it } from '@jest/globals';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from './foss-demo-order.repository.js';

describe('FossDemoOrderRepository (In-Memory)', () => {
  let repository: FossDemoOrderRepository;

  beforeEach(() => {
    repository = new FossDemoOrderRepository();
  });

  it('saves and finds an order by ID', async () => {
    const order = new FossDemoOrder();
    order.orderId = 'order-001';
    order.bookingId = 'booking-101';
    order.roomNumber = '101';
    order.idempotencyKey = 'idemp-001';

    await repository.save(order);

    const found = await repository.findById('order-001');
    expect(found).not.toBeNull();
    expect(found?.orderId).toBe('order-001');
    expect(found?.bookingId).toBe('booking-101');
  });

  it('finds an order by idempotency key', async () => {
    const order = new FossDemoOrder();
    order.orderId = 'order-002';
    order.bookingId = 'booking-102';
    order.roomNumber = '102';
    order.idempotencyKey = 'idemp-key-123';

    await repository.save(order);

    const found = await repository.findByIdempotencyKey('idemp-key-123');
    expect(found).not.toBeNull();
    expect(found?.orderId).toBe('order-002');
  });

  it('returns null when order or idempotency key is not found', async () => {
    expect(await repository.findById('non-existent')).toBeNull();
    expect(await repository.findByIdempotencyKey('non-existent')).toBeNull();
  });

  it('throws duplicate key error code 23505 on conflicting idempotency key', async () => {
    const order1 = new FossDemoOrder();
    order1.orderId = 'order-001';
    order1.idempotencyKey = 'idemp-shared';
    await repository.save(order1);

    const order2 = new FossDemoOrder();
    order2.orderId = 'order-002';
    order2.idempotencyKey = 'idemp-shared';

    await expect(repository.save(order2)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    );
  });

  it('finds orders by booking and room in descending order of creation', async () => {
    const older = new FossDemoOrder();
    older.orderId = 'order-older';
    older.bookingId = 'booking-101';
    older.roomNumber = '101';
    older.idempotencyKey = 'idemp-older';
    older.createdAt = new Date('2026-10-31T10:00:00Z');

    const newer = new FossDemoOrder();
    newer.orderId = 'order-newer';
    newer.bookingId = 'booking-101';
    newer.roomNumber = '101';
    newer.idempotencyKey = 'idemp-newer';
    newer.createdAt = new Date('2026-10-31T11:00:00Z');

    await repository.save(older);
    await repository.save(newer);

    const results = await repository.findByBookingAndRoom('booking-101', '101');
    expect(results).toHaveLength(2);
    expect(results[0].orderId).toBe('order-newer');
    expect(results[1].orderId).toBe('order-older');
  });

  it('resets in-memory state cleanly', async () => {
    const order = new FossDemoOrder();
    order.orderId = 'order-001';
    order.bookingId = 'booking-101';
    order.roomNumber = '101';
    order.idempotencyKey = 'idemp-001';
    await repository.save(order);

    expect(await repository.findById('order-001')).not.toBeNull();

    repository.reset();

    expect(await repository.findById('order-001')).toBeNull();
  });
});
