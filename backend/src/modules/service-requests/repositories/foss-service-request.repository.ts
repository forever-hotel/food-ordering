import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossServiceRequest } from '../entities/foss-service-request.entity.js';

@Injectable()
export class FossServiceRequestRepository {
  constructor(
    @InjectRepository(FossServiceRequest)
    private readonly repository: Repository<FossServiceRequest>,
  ) {}

  public async save(request: FossServiceRequest): Promise<FossServiceRequest> {
    return this.repository.save(request);
  }

  public async findById(requestId: string): Promise<FossServiceRequest | null> {
    return this.repository.findOne({
      where: { requestId },
    });
  }

  public async findByBookingAndRoom(
    bookingId: string,
    roomNumber: string,
  ): Promise<FossServiceRequest[]> {
    return this.repository.find({
      where: { bookingId, roomNumber },
      order: { createdAt: 'DESC' },
    });
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FossServiceRequest | null> {
    return this.repository.findOne({
      where: { idempotencyKey },
    });
  }
}
