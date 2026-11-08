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
    if (process.env.SHARED_DATABASE_MODE === 'true') {
      request.completedAt =
        request.status === ServiceRequestStatus.COMPLETED
          ? request.updatedAt
          : null;
    }
    return this.repository.save(request);
  }

  public async findById(requestId: string): Promise<FossServiceRequest | null> {
    if (!requestId || typeof requestId !== 'string') {
      return null;
    }
    const trimmed = requestId.trim();
    if (!trimmed) {
      return null;
    }
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      );
    const request = await this.repository.findOne({
      where: isUuid
        ? [{ requestId: trimmed }, { publicReference: trimmed }]
        : { publicReference: trimmed },
    });
    return request ? (await this.withTaskState([request]))[0] : null;
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
      where.category = filters.requestType;
    }

    const requests = await this.repository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
    });
    return this.withTaskState(requests);
  }

  private async withTaskState(
    requests: FossServiceRequest[],
  ): Promise<FossServiceRequest[]> {
    if (process.env.SHARED_DATABASE_MODE === 'true' && requests.length) {
      const rows = await this.repository.manager.query(
        `SELECT t.service_request_id,t.status,t.updated_at,s.full_name
        FROM public.wkms_tasks t LEFT JOIN public.staff_users s ON s.worker_id=t.assigned_worker_id
        WHERE t.service_request_id=ANY($1::uuid[])`,
        [requests.map((item) => item.requestId)],
      );
      for (const item of requests) {
        const task = rows.find(
          (row: { service_request_id: string }) =>
            row.service_request_id === item.requestId,
        );
        if (!task) continue;
        item.status =
          task.status === 'COMPLETED'
            ? ServiceRequestStatus.COMPLETED
            : task.status === 'IN_PROGRESS' || task.status === 'ESCALATED'
              ? ServiceRequestStatus.IN_PROGRESS
              : task.status === 'ASSIGNED'
                ? ServiceRequestStatus.ASSIGNED
                : ServiceRequestStatus.SUBMITTED;
        item.assignedStaff = task.full_name ?? null;
        item.updatedAt = new Date(task.updated_at);
      }
    }
    return requests;
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
