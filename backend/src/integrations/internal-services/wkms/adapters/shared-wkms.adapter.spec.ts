import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { TaskPriority, TaskType } from '../dto/wkms-task.dto.js';
import { SharedWkmsAdapter } from './shared-wkms.adapter.js';

describe('SharedWkmsAdapter', () => {
  const originalFetch = global.fetch;
  let adapter: SharedWkmsAdapter;
  let mockDatabase: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      query: jest.fn<any>(),
    };

    mockDatabase = {
      transaction: jest.fn<any>(async (cb: (mgr: any) => Promise<any>) =>
        cb(mockManager),
      ),
      query: jest.fn<any>().mockResolvedValue([]),
    };

    adapter = new SharedWkmsAdapter(
      mockDatabase as unknown as DataSource,
      'https://wkms.internal.foreverhotel.com',
      'test-wkms-key-at-least-32-characters',
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates and dispatches a new service request task successfully', async () => {
    mockManager.query
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([]) // existing request check -> not found
      .mockResolvedValueOnce([
        {
          request_id: '11111111-1111-4111-a111-111111111111',
          booking_id: 'b-101',
          room_number: '101',
          category: TaskType.EXTRA_TOWELS,
          description: 'Two large towels',
          priority: TaskPriority.NORMAL,
          created_at: new Date('2026-10-31T10:00:00Z'),
          updated_at: new Date('2026-10-31T10:00:00Z'),
        },
      ]);

    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ taskId: 'task-789', status: 'SUBMITTED' }),
    });

    const result = await adapter.createTask({
      bookingId: 'b-101',
      roomNumber: '101',
      taskType: TaskType.EXTRA_TOWELS,
      description: 'Two large towels',
      priority: TaskPriority.NORMAL,
      idempotencyKey: 'idemp-wkms-1',
    });

    expect(result.taskId).toBe('task-789');
    expect(result.requestId).toBe('11111111-1111-4111-a111-111111111111');
    expect(mockDatabase.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE public.foss_service_requests SET task_id=$2',
      ),
      ['11111111-1111-4111-a111-111111111111', 'task-789'],
    );
  });

  it('replays existing request matching idempotency key', async () => {
    mockManager.query
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([
        {
          request_id: '11111111-1111-4111-a111-111111111111',
          booking_id: 'b-101',
          room_number: '101',
          category: TaskType.EXTRA_TOWELS,
          description: 'Two large towels',
          priority: TaskPriority.NORMAL,
          created_at: new Date('2026-10-31T10:00:00Z'),
          updated_at: new Date('2026-10-31T10:00:00Z'),
        },
      ]);

    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ taskId: 'task-789', status: 'SUBMITTED' }),
    });

    const result = await adapter.createTask({
      bookingId: 'b-101',
      roomNumber: '101',
      taskType: TaskType.EXTRA_TOWELS,
      description: 'Two large towels',
      priority: TaskPriority.NORMAL,
      idempotencyKey: 'idemp-wkms-1',
    });

    expect(result.taskId).toBe('task-789');
    expect(result.requestId).toBe('11111111-1111-4111-a111-111111111111');
  });

  it('rejects idempotency reuse from another booking or room with ForbiddenException', async () => {
    mockManager.query
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([
        {
          request_id: 'req-old',
          booking_id: 'different-booking',
          room_number: '999',
          category: TaskType.EXTRA_TOWELS,
          description: 'Towels',
        },
      ]);

    await expect(
      adapter.createTask({
        bookingId: 'b-101',
        roomNumber: '101',
        taskType: TaskType.EXTRA_TOWELS,
        description: 'Towels',
        priority: TaskPriority.NORMAL,
        idempotencyKey: 'idemp-wkms-cross',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects idempotency reuse with conflicting task details with ConflictException', async () => {
    mockManager.query
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([
        {
          request_id: 'req-old',
          booking_id: 'b-101',
          room_number: '101',
          category: TaskType.MAINTENANCE,
          description: 'AC broken',
        },
      ]);

    await expect(
      adapter.createTask({
        bookingId: 'b-101',
        roomNumber: '101',
        taskType: TaskType.EXTRA_TOWELS,
        description: 'Towels',
        priority: TaskPriority.NORMAL,
        idempotencyKey: 'idemp-wkms-conflict',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws UpstreamServiceUnavailableException when WKMS task dispatch fails', async () => {
    mockManager.query
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([]) // existing check
      .mockResolvedValueOnce([
        {
          request_id: 'req-saved',
          booking_id: 'b-101',
          room_number: '101',
          category: TaskType.EXTRA_TOWELS,
          description: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      adapter.createTask({
        bookingId: 'b-101',
        roomNumber: '101',
        taskType: TaskType.EXTRA_TOWELS,
        priority: TaskPriority.NORMAL,
        idempotencyKey: 'idemp-wkms-fail',
      }),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
  });
});
