import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FossServiceRequest } from '../entities/foss-service-request.entity.js';

import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

@Injectable()
export class FossServiceRequestRepository {
  private readonly logger = new Logger(FossServiceRequestRepository.name);

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
    if (!requests || requests.length === 0) {
      return requests;
    }

    const isSharedMode = process.env.SHARED_DATABASE_MODE === 'true';

    if (!isSharedMode) {
      return requests;
    }

    try {
      const taskIds = Array.from(
        new Set(
          requests
            .map((r) => r.taskId)
            .filter(
              (id): id is string =>
                typeof id === 'string' && id.trim().length > 0,
            ),
        ),
      );
      const requestIds = Array.from(
        new Set(
          requests
            .map((r) => r.requestId)
            .filter(
              (id): id is string =>
                typeof id === 'string' && id.trim().length > 0,
            ),
        ),
      );

      if (taskIds.length === 0 && requestIds.length === 0) {
        return requests;
      }

      const conditions: string[] = [];
      const params: any[] = [];

      if (taskIds.length > 0) {
        params.push(taskIds);
        conditions.push(`t.task_id::text = ANY($${params.length}::text[])`);
      }
      if (requestIds.length > 0) {
        params.push(requestIds);
        conditions.push(
          `t.service_request_id::text = ANY($${params.length}::text[])`,
        );
      }

      // Strictly read-only query against public.wkms_tasks and public.staff_users
      const taskRows: any[] = await this.repository.manager.query(
        `SELECT 
           t.task_id::text AS task_id,
           t.service_request_id::text AS service_request_id,
           t.room_number,
           t.booking_id::text AS booking_id,
           t.status,
           t.submitted_at,
           t.completed_at,
           t.updated_at,
           s.full_name AS assigned_staff
         FROM public.wkms_tasks t
         LEFT JOIN public.staff_users s ON s.worker_id = t.assigned_worker_id
         WHERE ${conditions.join(' OR ')}`,
        params,
      );

      const matchedTaskMap = new Map<string, any>();
      const verifiedTaskIds: string[] = [];

      for (const req of requests) {
        const matchingRow = taskRows.find((row: any) => {
          const idMatch =
            (Boolean(req.taskId) &&
              String(row.task_id).trim() === String(req.taskId).trim()) ||
            (Boolean(row.service_request_id) &&
              String(row.service_request_id).trim() ===
                String(req.requestId).trim());
          if (!idMatch) return false;

          // Scope security: positive verification of booking and room boundaries
          const reqBooking = (req.bookingId || '').trim();
          const rowBooking = (row.booking_id || '').trim();
          if (!reqBooking || !rowBooking || reqBooking !== rowBooking) {
            return false;
          }

          const reqRoom = (req.roomNumber || '').trim();
          const rowRoom = (row.room_number || '').trim();
          if (!reqRoom || !rowRoom || reqRoom !== rowRoom) {
            return false;
          }

          return true;
        });

        if (matchingRow) {
          matchedTaskMap.set(req.requestId, matchingRow);
          // Optimization: only query audit logs for tasks that have transitioned beyond initial creation
          const status = (matchingRow.status || '').toUpperCase();
          const hasTransitions =
            status === 'ASSIGNED' ||
            status === 'IN_PROGRESS' ||
            status === 'COMPLETED';
          if (matchingRow.task_id && hasTransitions) {
            verifiedTaskIds.push(matchingRow.task_id);
          }
        }
      }

      // Strictly read-only query against public.audit_logs for authoritative transition timestamps
      const auditMap = new Map<
        string,
        {
          assignedAt?: Date;
          inProgressAt?: Date;
          completedAt?: Date;
        }
      >();

      if (verifiedTaskIds.length > 0) {
        try {
          const uniqueTaskIds = Array.from(new Set(verifiedTaskIds));
          const auditRows: any[] = await this.repository.manager.query(
            `SELECT 
               entity_id AS task_id,
               action,
               created_at
             FROM public.audit_logs
             WHERE entity_type = 'WKMS_TASK'
               AND entity_id = ANY($1::text[])
               AND action IN ('TASK_CLAIMED', 'TASK_MANUALLY_ASSIGNED', 'TASK_STARTED', 'TASK_COMPLETED')
             ORDER BY created_at ASC`,
            [uniqueTaskIds],
          );

          for (const audit of auditRows) {
            const tid = audit.task_id || audit.entity_id;
            if (!tid) continue;
            if (!auditMap.has(tid)) {
              auditMap.set(tid, {});
            }
            const entry = auditMap.get(tid)!;
            const dt = new Date(audit.created_at);

            // For reassigned tasks, ORDER BY created_at ASC ensures that entry.assignedAt
            // reflects the most recent assignment timestamp, matching the currently assigned worker.
            if (
              audit.action === 'TASK_CLAIMED' ||
              audit.action === 'TASK_MANUALLY_ASSIGNED'
            ) {
              entry.assignedAt = dt;
            } else if (audit.action === 'TASK_STARTED') {
              entry.inProgressAt = dt;
            } else if (audit.action === 'TASK_COMPLETED') {
              entry.completedAt = dt;
            }
          }
        } catch (auditErr: unknown) {
          this.logger.debug?.(
            `Audit log synchronization unavailable: ${(auditErr as Error)?.message || auditErr}`,
          );
        }
      }

      // Synchronize authoritative state and transition timestamps into request entities
      for (const item of requests) {
        const task = matchedTaskMap.get(item.requestId);
        if (!task) continue;

        if (!item.taskId && task.task_id) {
          item.taskId = task.task_id;
        }

        const rawStatus = (task.status || '').toUpperCase();
        let mappedStatus: ServiceRequestStatus = ServiceRequestStatus.SUBMITTED;
        if (rawStatus === 'COMPLETED') {
          mappedStatus = ServiceRequestStatus.COMPLETED;
        } else if (rawStatus === 'IN_PROGRESS') {
          mappedStatus = ServiceRequestStatus.IN_PROGRESS;
        } else if (rawStatus === 'ASSIGNED') {
          mappedStatus = ServiceRequestStatus.ASSIGNED;
        } else {
          // UNASSIGNED, ESCALATED, CREATED, SUBMITTED map to SUBMITTED
          mappedStatus = ServiceRequestStatus.SUBMITTED;
        }

        // Prevent regressing an already COMPLETED request due to an out-of-order response
        if (mappedStatus) {
          if (
            item.status !== ServiceRequestStatus.COMPLETED ||
            mappedStatus === ServiceRequestStatus.COMPLETED
          ) {
            item.status = mappedStatus;
          }
        }

        const staffName = task.assigned_staff || task.full_name;
        item.assignedStaff = staffName || null;

        if (task.updated_at) {
          item.updatedAt = new Date(task.updated_at);
        }

        const audits = auditMap.get(task.task_id) || {};
        const completedDate = task.completed_at
          ? new Date(task.completed_at)
          : (audits.completedAt ??
            (item.status === ServiceRequestStatus.COMPLETED
              ? (item.completedAt ?? null)
              : null));

        item.completedAt = completedDate;

        item.timelineTimestamps = {
          submittedAt:
            item.createdAt ??
            (task.submitted_at ? new Date(task.submitted_at) : null),
          assignedAt: audits.assignedAt ?? null,
          inProgressAt: audits.inProgressAt ?? null,
          completedAt: completedDate,
        };
      }
    } catch (err: unknown) {
      this.logger.warn(
        `WKMS task state synchronization bypassed: ${(err as Error)?.message || err}`,
      );
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
