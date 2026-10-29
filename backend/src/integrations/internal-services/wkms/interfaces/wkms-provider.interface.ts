import { WkmsCreateTaskDto } from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';

export const WKMS_PROVIDER = Symbol('WKMS_PROVIDER');

export abstract class WkmsProvider {
  abstract createTask(task: WkmsCreateTaskDto): Promise<WkmsTaskResultDto>;
  abstract getTask(taskId: string): Promise<WkmsTaskResultDto | null>;
  abstract cancelTask(
    taskId: string,
    reason?: string,
  ): Promise<WkmsTaskResultDto>;
}
