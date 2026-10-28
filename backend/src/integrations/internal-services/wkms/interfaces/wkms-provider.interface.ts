import { WkmsCreateTaskDto } from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';

export const WKMS_PROVIDER = Symbol('WKMS_PROVIDER');

export interface WkmsProvider {
  createTask(task: WkmsCreateTaskDto): Promise<WkmsTaskResultDto>;
  getTask(taskId: string): Promise<WkmsTaskResultDto | null>;
  cancelTask(taskId: string, reason?: string): Promise<WkmsTaskResultDto>;
}
