import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossComplaint } from '../entities/foss-complaint.entity.js';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';
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
    if (!complaintId || typeof complaintId !== 'string') {
      return null;
    }
    const trimmed = complaintId.trim();
    if (!trimmed) {
      return null;
    }
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      );
    if (isUuid) {
      return this.repository.findOne({
        where: [{ complaintId: trimmed }, { publicReference: trimmed }],
      });
    }
    return this.repository.findOne({
      where: { publicReference: trimmed },
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
      category?: ComplaintCategory;
      severity?: ComplaintSeverity;
      limit?: number;
      offset?: number;
    },
  ): Promise<FossComplaint[]> {
    const where: any = { bookingId, roomNumber };
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.severity) {
      where.severity = filters.severity;
    }

    return this.repository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
    });
  }
}
