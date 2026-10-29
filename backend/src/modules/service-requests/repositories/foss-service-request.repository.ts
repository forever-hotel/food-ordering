import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossServiceRequest } from '../entities/foss-service-request.entity.js';

import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

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
    filters?: {
      status?: ServiceRequestStatus;
      requestType?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<FossServiceRequest[]> {
    const where: any = { bookingId, roomNumber };
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.requestType) {
      where.requestType = filters.requestType;
    }

    return this.repository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
    });
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FossServiceRequest | null> {
    return this.repository.findOne({
      where: { idempotencyKey },
    });
  }

  public async findByTaskId(
    taskId: string,
  ): Promise<FossServiceRequest | null> {
    return this.repository.findOne({
      where: { taskId },
    });
  }
}
