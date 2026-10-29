import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';

@Injectable()
export class FossDemoOrderRepository {
  constructor(
    @InjectRepository(FossDemoOrder)
    private readonly repository: Repository<FossDemoOrder>,
  ) {}

  public async findById(orderId: string): Promise<FossDemoOrder | null> {
    return this.repository.findOne({
      where: { orderId },
      relations: { items: true },
    });
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FossDemoOrder | null> {
    return this.repository.findOne({
      where: { idempotencyKey },
      relations: { items: true },
    });
  }

  public async findByBookingAndRoom(
    bookingId: string,
    roomNumber: string,
  ): Promise<FossDemoOrder[]> {
    return this.repository.find({
      where: { bookingId, roomNumber },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  public async save(order: FossDemoOrder): Promise<FossDemoOrder> {
    return this.repository.save(order);
  }
}
