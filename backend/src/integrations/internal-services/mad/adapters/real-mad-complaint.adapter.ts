import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { MadCreateComplaintDto } from '../dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../dto/mad-complaint-result.dto.js';
import { MadComplaintProvider } from '../interfaces/mad-complaint-provider.interface.js';

@Injectable()
export class RealMadComplaintAdapter implements MadComplaintProvider {
  private readonly logger = new Logger(RealMadComplaintAdapter.name);

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
  ) {}

  public async fileComplaint(
    complaint: MadCreateComplaintDto,
  ): Promise<MadComplaintResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<MadComplaintResultDto>(
      '/api/v1/complaints',
      'POST',
      complaint,
    );
  }

  public async getComplaint(
    complaintId: string,
  ): Promise<MadComplaintResultDto | null> {
    this.assertConfigured();
    return this.executeHttpCall<MadComplaintResultDto>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}`,
      'GET',
    );
  }

  /**
   * Complaint resolution and managerial notes are strictly owned by MAD.
   * FOSS owns guest complaint creation (intake). It has no domain authority to resolve
   * complaints directly in production.
   * Unauthorized resolution calls are rejected with ForbiddenException.
   */
  public async resolveComplaint(
    complaintId: string,
    _resolutionNotes: string,
  ): Promise<MadComplaintResultDto> {
    this.assertConfigured();
    this.logger.warn(
      `Rejecting unauthorized complaint resolution for complaint [${complaintId}]: Complaint resolution is strictly owned by MAD.`,
    );
    throw new ForbiddenException(
      'Complaint resolution is strictly owned by MAD. FOSS cannot resolve complaints directly in production.',
    );
  }

  private assertConfigured(): void {
    if (!this.baseUrl || this.baseUrl.trim() === '') {
      this.logger.error(
        'MAD service URL is missing or unconfigured. Failing closed.',
      );
      throw new UpstreamServiceUnavailableException(
        'MAD',
        'Manager Assistance Desk endpoint is unconfigured in this environment.',
      );
    }
  }

  private async executeHttpCall<T>(
    endpoint: string,
    method: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.log(`Executing upstream MAD request: ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.apiKey ? { 'X-MAD-API-Key': this.apiKey } : {}),
        },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(
          `Upstream MAD returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      this.logger.error(`Upstream MAD request failed: ${err.message}`);
      throw new UpstreamServiceUnavailableException('MAD', err.message);
    }
  }
}
