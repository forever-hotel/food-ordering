import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { WkmsCreateTaskDto } from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';
import { WkmsProvider } from '../interfaces/wkms-provider.interface.js';

@Injectable()
export class RealWkmsAdapter implements WkmsProvider {
  private readonly logger = new Logger(RealWkmsAdapter.name);

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
  ) {}

  public async createTask(task: WkmsCreateTaskDto): Promise<WkmsTaskResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<WkmsTaskResultDto>(
      '/api/v1/tasks',
      'POST',
      task,
    );
  }

  public async getTask(taskId: string): Promise<WkmsTaskResultDto | null> {
    this.assertConfigured();
    return this.executeHttpCall<WkmsTaskResultDto>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      'GET',
    );
  }

  public async cancelTask(
    taskId: string,
    reason?: string,
  ): Promise<WkmsTaskResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<WkmsTaskResultDto>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
      'POST',
      { reason },
    );
  }

  /**
   * Task status transitions are strictly owned by WKMS.
   * FOSS has no authoritative worker dispatch or task execution domain permissions
   * to mutate task states in production.
   * Unauthorized mutations are rejected with ForbiddenException.
   */
  public async transitionTaskStatus(
    taskId: string,
    newStatus: string,
    _assignedStaff?: string,
  ): Promise<WkmsTaskResultDto> {
    this.assertConfigured();
    this.logger.warn(
      `Rejecting unauthorized task status transition for task [${taskId}] to [${newStatus}]: Worker task status transitions are strictly owned by WKMS.`,
    );
    throw new ForbiddenException(
      'Task status transitions are strictly owned by WKMS. FOSS cannot mutate worker task statuses in production.',
    );
  }

  private assertConfigured(): void {
    if (!this.baseUrl || this.baseUrl.trim() === '') {
      this.logger.error(
        'WKMS service URL is missing or unconfigured. Failing closed.',
      );
      throw new UpstreamServiceUnavailableException(
        'WKMS',
        'Worker/Task Management System endpoint is unconfigured in this environment.',
      );
    }
  }

  private async executeHttpCall<T>(
    endpoint: string,
    method: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.log(`Executing upstream WKMS request: ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.apiKey ? { 'X-WKMS-API-Key': this.apiKey } : {}),
        },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(
          `Upstream WKMS returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      this.logger.error(`Upstream WKMS request failed: ${err.message}`);
      throw new UpstreamServiceUnavailableException('WKMS', err.message);
    }
  }
}
