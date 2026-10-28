import { Injectable, Logger } from '@nestjs/common';
import { ServiceRequestStatus } from '../../../../modules/service-requests/enums/service-request-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { WkmsCreateTaskDto } from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';
import { WKMS_FIXTURE_TASK_SUBMITTED } from '../fixtures/wkms-contract.fixtures.js';
import { WkmsProvider } from '../interfaces/wkms-provider.interface.js';

@Injectable()
export class MockWkmsAdapter implements WkmsProvider {
  private readonly logger = new Logger(MockWkmsAdapter.name);

  private tasks: Map<string, WkmsTaskResultDto> = new Map();
  private idempotencyMap: Map<string, string> = new Map();
  private simulateDown = false;
  private simulateTimeout = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.tasks.clear();
    this.idempotencyMap.clear();
    this.simulateDown = false;
    this.simulateTimeout = false;

    // Seed default fixture task
    const defaultTask = { ...WKMS_FIXTURE_TASK_SUBMITTED };
    this.tasks.set(defaultTask.taskId, defaultTask);
    this.idempotencyMap.set('idemp-wkms-fixture-001', defaultTask.taskId);
  }

  public setSimulateDown(state: boolean): void {
    this.simulateDown = state;
  }

  public setSimulateTimeout(state: boolean): void {
    this.simulateTimeout = state;
  }

  public async createTask(task: WkmsCreateTaskDto): Promise<WkmsTaskResultDto> {
    this.checkSimulations();

    if (this.idempotencyMap.has(task.idempotencyKey)) {
      const existingTaskId = this.idempotencyMap.get(task.idempotencyKey)!;
      this.logger.log(
        `Idempotent task replay detected for key [${task.idempotencyKey}]. Returning task [${existingTaskId}].`,
      );
      return this.tasks.get(existingTaskId)!;
    }

    const taskId =
      task.taskId ||
      `task-wkms-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const createdTask: WkmsTaskResultDto = {
      taskId,
      roomNumber: task.roomNumber,
      bookingId: task.bookingId,
      taskType: task.taskType,
      description: task.description || null,
      status: ServiceRequestStatus.SUBMITTED,
      priority: task.priority,
      assignedStaff: null,
      estimatedCompletionMinutes: 20,
      createdAt: now,
      updatedAt: now,
      version: ContractVersion.V1_0,
    };

    this.tasks.set(taskId, createdTask);
    this.idempotencyMap.set(task.idempotencyKey, taskId);

    this.logger.log(
      `Mock WKMS task created: [${taskId}] for room [${task.roomNumber}] type [${task.taskType}]`,
    );
    return createdTask;
  }

  public async getTask(taskId: string): Promise<WkmsTaskResultDto | null> {
    this.checkSimulations();
    const task = this.tasks.get(taskId);
    return task ? { ...task } : null;
  }

  public async cancelTask(
    taskId: string,
    reason?: string,
  ): Promise<WkmsTaskResultDto> {
    this.checkSimulations();

    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found in WKMS.`);
    }

    if (task.status === ServiceRequestStatus.COMPLETED) {
      throw new Error(
        `Task [${taskId}] cannot be cancelled because it is already completed.`,
      );
    }

    // Cancelled in WKMS
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);

    this.logger.log(
      `Mock WKMS task cancelled: [${taskId}]${reason ? ` Reason: ${reason}` : ''}`,
    );
    return { ...task };
  }

  public transitionStatus(
    taskId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): WkmsTaskResultDto {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found in WKMS.`);
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();
    if (assignedStaff) {
      task.assignedStaff = assignedStaff;
    }
    if (newStatus === ServiceRequestStatus.COMPLETED) {
      task.estimatedCompletionMinutes = 0;
    }
    this.tasks.set(taskId, task);
    return { ...task };
  }

  private checkSimulations(): void {
    if (this.simulateDown) {
      throw new Error(
        'WKMS upstream gateway is unreachable (simulated connection refusal).',
      );
    }
    if (this.simulateTimeout) {
      throw new Error('WKMS upstream gateway timed out after 5000ms.');
    }
  }
}
