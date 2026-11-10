import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { RealWkmsAdapter } from './real-wkms.adapter.js';
import { WkmsCreateTaskDto } from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';
import { ServiceRequestStatus } from '../../../../modules/service-requests/enums/service-request-status.enum.js';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';

/** FOSS owns the request; WKMS creates the linked task through its existing internal API. */
export class SharedWkmsAdapter extends RealWkmsAdapter {
  private readonly dispatchLogger = new Logger(SharedWkmsAdapter.name);
  constructor(
    private readonly database: DataSource,
    private readonly endpoint: string,
    private readonly credential: string,
  ) {
    super(endpoint, credential);
  }

  override async createTask(
    input: WkmsCreateTaskDto,
  ): Promise<WkmsTaskResultDto & { requestId: string }> {
    const request = await this.database.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        ['foss-request:' + input.idempotencyKey],
      );
      const [old] = await manager.query(
        'SELECT * FROM public.foss_service_requests WHERE idempotency_key=$1',
        [input.idempotencyKey],
      );
      if (old) {
        if (
          old.booking_id !== input.bookingId ||
          old.room_number !== input.roomNumber
        )
          throw new ForbiddenException('Request belongs to another stay');
        if (
          old.category !== input.taskType ||
          old.description !== (input.description ?? null)
        )
          throw new ConflictException(
            'Idempotency key has a different request',
          );
        return old;
      }
      const [created] = await manager.query(
        `INSERT INTO public.foss_service_requests
        (request_id,booking_id,room_number,category,description,status,source,priority,idempotency_key)
        VALUES($1,$2,$3,$4,$5,'SUBMITTED','GUEST_APP',$6,$7) RETURNING *`,
        [
          randomUUID(),
          input.bookingId,
          input.roomNumber,
          input.taskType,
          input.description ?? null,
          input.priority,
          input.idempotencyKey,
        ],
      );
      return created;
    });
    let task: { taskId: string; status: string };
    try {
      const response = await fetch(
        `${this.endpoint.replace(/\/$/, '')}/wkms/internal/tasks`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.credential}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ requestId: request.request_id }),
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
      if (!response.ok) {
        this.dispatchLogger.warn(`WKMS_DISPATCH_HTTP_${response.status}`);
        throw new Error();
      }
      task = await response.json();
      if (typeof task.taskId !== 'string') throw new Error();
    } catch {
      throw new UpstreamServiceUnavailableException(
        'WKMS',
        'Request is saved; retry with the same request key to dispatch its task.',
      );
    }
    await this.database.query(
      'UPDATE public.foss_service_requests SET task_id=$2 WHERE request_id=$1',
      [request.request_id, task.taskId],
    );
    return {
      taskId: task.taskId,
      requestId: request.request_id,
      bookingId: input.bookingId,
      roomNumber: input.roomNumber,
      taskType: input.taskType,
      description: input.description ?? null,
      priority: input.priority,
      status: ServiceRequestStatus.SUBMITTED,
      estimatedCompletionMinutes: 20,
      createdAt: new Date(request.created_at).toISOString(),
      updatedAt: new Date(request.updated_at).toISOString(),
      version: '1.0',
    };
  }
}
