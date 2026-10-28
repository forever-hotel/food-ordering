import { beforeEach, describe, expect, it } from '@jest/globals';
import { ServiceRequestStatus } from '../../../../modules/service-requests/enums/service-request-status.enum.js';
import { TaskType } from '../dto/wkms-task.dto.js';
import { WKMS_FIXTURE_CREATE_TASK_VALID } from '../fixtures/wkms-contract.fixtures.js';
import { MockWkmsAdapter } from './mock-wkms.adapter.js';

describe('MockWkmsAdapter', () => {
  let adapter: MockWkmsAdapter;

  beforeEach(() => {
    adapter = new MockWkmsAdapter();
  });

  it('creates a service task and stores deterministic state', async () => {
    const task = await adapter.createTask({
      ...WKMS_FIXTURE_CREATE_TASK_VALID,
      idempotencyKey: 'fresh-wkms-key-1',
    });

    expect(task.taskId).toBeDefined();
    expect(task.status).toBe(ServiceRequestStatus.SUBMITTED);
    expect(task.roomNumber).toBe('101');
    expect(task.taskType).toBe(TaskType.EXTRA_TOWELS);

    const fetched = await adapter.getTask(task.taskId);
    expect(fetched).toEqual(task);
  });

  it('replays existing task when identical idempotency key is submitted', async () => {
    const key = 'test-wkms-replay-key';
    const firstCall = await adapter.createTask({
      ...WKMS_FIXTURE_CREATE_TASK_VALID,
      idempotencyKey: key,
    });

    const secondCall = await adapter.createTask({
      ...WKMS_FIXTURE_CREATE_TASK_VALID,
      idempotencyKey: key,
    });

    expect(secondCall.taskId).toBe(firstCall.taskId);
    expect(secondCall.createdAt).toBe(firstCall.createdAt);
  });

  it('transitions task status through assignment, progress, and completion', async () => {
    const taskId = 'task-fixture-001';

    const assigned = adapter.transitionStatus(
      taskId,
      ServiceRequestStatus.ASSIGNED,
      'Staff John R.',
    );
    expect(assigned.status).toBe(ServiceRequestStatus.ASSIGNED);
    expect(assigned.assignedStaff).toBe('Staff John R.');

    const inProgress = adapter.transitionStatus(
      taskId,
      ServiceRequestStatus.IN_PROGRESS,
    );
    expect(inProgress.status).toBe(ServiceRequestStatus.IN_PROGRESS);

    const completed = adapter.transitionStatus(
      taskId,
      ServiceRequestStatus.COMPLETED,
    );
    expect(completed.status).toBe(ServiceRequestStatus.COMPLETED);
    expect(completed.estimatedCompletionMinutes).toBe(0);
  });

  it('cancels an active task', async () => {
    const taskId = 'task-fixture-001';
    const result = await adapter.cancelTask(
      taskId,
      'Guest no longer needs towels',
    );
    expect(result).toBeDefined();
  });

  it('throws an error if attempting to cancel an already completed task', async () => {
    const taskId = 'task-fixture-001';
    adapter.transitionStatus(taskId, ServiceRequestStatus.COMPLETED);

    await expect(adapter.cancelTask(taskId)).rejects.toThrow(
      'cannot be cancelled because it is already completed',
    );
  });

  it('simulates outage and timeout when flags are set', async () => {
    adapter.setSimulateDown(true);
    await expect(adapter.getTask('task-fixture-001')).rejects.toThrow(
      'simulated connection refusal',
    );

    adapter.setSimulateDown(false);
    adapter.setSimulateTimeout(true);
    await expect(adapter.cancelTask('task-fixture-001')).rejects.toThrow(
      'timed out after 5000ms',
    );
  });

  it('resets to default fixture state', async () => {
    adapter.setSimulateDown(true);
    adapter.reset();

    const task = await adapter.getTask('task-fixture-001');
    expect(task).toBeDefined();
    expect(task?.status).toBe(ServiceRequestStatus.SUBMITTED);
  });
});
