import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossComplaint } from '../entities/foss-complaint.entity.js';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

@Injectable()
export class FossComplaintRepository {
  constructor(
    @InjectRepository(FossComplaint)
    private readonly repository: Repository<FossComplaint>,
  ) {}

  public async save(complaint: FossComplaint): Promise<FossComplaint> {
    return this.repository.save(complaint);
  }

  public async findById(complaintId: string): Promise<FossComplaint | null> {
    return this.repository.findOne({
      where: { complaintId },
    });
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FossComplaint | null> {
    return this.repository.findOne({
      where: { idempotencyKey },
    });
  }

  public async findByBookingAndRoom(
    bookingId: string,
    roomNumber: string,
    filters?: {
      status?: ComplaintStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<FossComplaint[]> {
    const where: any = { bookingId, roomNumber };
    if (filters?.status) {
      where.status = filters.status;
    }

    return this.repository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
    });
  }
}
