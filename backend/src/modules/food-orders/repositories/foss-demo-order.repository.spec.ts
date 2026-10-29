import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from './foss-demo-order.repository.js';

describe('FossDemoOrderRepository', () => {
  let repository: FossDemoOrderRepository;
  let typeOrmRepository: {
    findOne: jest.MockedFunction<Repository<FossDemoOrder>['findOne']>;
    find: jest.MockedFunction<Repository<FossDemoOrder>['find']>;
    save: jest.MockedFunction<(order: FossDemoOrder) => Promise<FossDemoOrder>>;
  };

  beforeEach(() => {
    typeOrmRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(
        async (order: FossDemoOrder): Promise<FossDemoOrder> => order,
      ),
    };

    repository = new FossDemoOrderRepository(
      typeOrmRepository as unknown as Repository<FossDemoOrder>,
    );
  });

  it('finds an order by ID with items relation', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    await repository.findById('order-001');

    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: { orderId: 'order-001' },
      relations: { items: true },
    });
  });

  it('finds an order by idempotency key with items relation', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    await repository.findByIdempotencyKey('idemp-key-123');

    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idemp-key-123' },
      relations: { items: true },
    });
  });

  it('finds orders by booking and room in descending order', async () => {
    typeOrmRepository.find.mockResolvedValue([]);

    await repository.findByBookingAndRoom('booking-101', '101');

    expect(typeOrmRepository.find).toHaveBeenCalledWith({
      where: { bookingId: 'booking-101', roomNumber: '101' },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  });

  it('saves an order', async () => {
    const order = new FossDemoOrder();
    order.orderId = 'order-001';

    await expect(repository.save(order)).resolves.toBe(order);
    expect(typeOrmRepository.save).toHaveBeenCalledWith(order);
  });
});
