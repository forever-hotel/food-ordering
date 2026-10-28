import { Injectable, Logger } from '@nestjs/common';
import { ComplaintStatus } from '../../../../modules/complaints/enums/complaint-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { MadCreateComplaintDto } from '../dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../dto/mad-complaint-result.dto.js';
import { MAD_FIXTURE_COMPLAINT_SUBMITTED } from '../fixtures/mad-contract.fixtures.js';
import { MadComplaintProvider } from '../interfaces/mad-complaint-provider.interface.js';

@Injectable()
export class MockMadComplaintAdapter implements MadComplaintProvider {
  private readonly logger = new Logger(MockMadComplaintAdapter.name);

  private complaints: Map<string, MadComplaintResultDto> = new Map();
  private idempotencyMap: Map<string, string> = new Map();
  private simulateDown = false;
  private simulateTimeout = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.complaints.clear();
    this.idempotencyMap.clear();
    this.simulateDown = false;
    this.simulateTimeout = false;

    // Seed default fixture complaint
    const defaultComplaint = { ...MAD_FIXTURE_COMPLAINT_SUBMITTED };
    this.complaints.set(defaultComplaint.complaintId, defaultComplaint);
    this.idempotencyMap.set(
      'idemp-mad-fixture-001',
      defaultComplaint.complaintId,
    );
  }

  public setSimulateDown(state: boolean): void {
    this.simulateDown = state;
  }

  public setSimulateTimeout(state: boolean): void {
    this.simulateTimeout = state;
  }

  public async fileComplaint(
    complaint: MadCreateComplaintDto,
  ): Promise<MadComplaintResultDto> {
    this.checkSimulations();

    if (this.idempotencyMap.has(complaint.idempotencyKey)) {
      const existingComplaintId = this.idempotencyMap.get(
        complaint.idempotencyKey,
      )!;
      this.logger.log(
        `Idempotent complaint replay detected for key [${complaint.idempotencyKey}]. Returning complaint [${existingComplaintId}].`,
      );
      return this.complaints.get(existingComplaintId)!;
    }

    const complaintId =
      complaint.complaintId ||
      `complaint-mad-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const createdComplaint: MadComplaintResultDto = {
      complaintId,
      roomNumber: complaint.roomNumber,
      bookingId: complaint.bookingId,
      category: complaint.category,
      severity: complaint.severity,
      subject: complaint.subject,
      description: complaint.description,
      status: ComplaintStatus.SUBMITTED,
      relatedOrderId: complaint.relatedOrderId || null,
      relatedTaskId: complaint.relatedTaskId || null,
      assignedManager: null,
      resolutionNotes: null,
      createdAt: now,
      updatedAt: now,
      version: ContractVersion.V1_0,
    };

    this.complaints.set(complaintId, createdComplaint);
    this.idempotencyMap.set(complaint.idempotencyKey, complaintId);

    this.logger.log(
      `Mock MAD complaint filed: [${complaintId}] for room [${complaint.roomNumber}] severity [${complaint.severity}]`,
    );
    return createdComplaint;
  }

  public async getComplaint(
    complaintId: string,
  ): Promise<MadComplaintResultDto | null> {
    this.checkSimulations();
    const complaint = this.complaints.get(complaintId);
    return complaint ? { ...complaint } : null;
  }

  public async resolveComplaint(
    complaintId: string,
    resolutionNotes: string,
  ): Promise<MadComplaintResultDto> {
    this.checkSimulations();

    const complaint = this.complaints.get(complaintId);
    if (!complaint) {
      throw new Error(`Complaint [${complaintId}] not found in MAD.`);
    }

    complaint.status = ComplaintStatus.RESOLVED;
    complaint.resolutionNotes = resolutionNotes;
    complaint.updatedAt = new Date().toISOString();
    this.complaints.set(complaintId, complaint);

    this.logger.log(`Mock MAD complaint resolved: [${complaintId}]`);
    return { ...complaint };
  }

  public transitionStatus(
    complaintId: string,
    newStatus: ComplaintStatus,
    assignedManager?: string,
  ): MadComplaintResultDto {
    const complaint = this.complaints.get(complaintId);
    if (!complaint) {
      throw new Error(`Complaint [${complaintId}] not found in MAD.`);
    }

    complaint.status = newStatus;
    complaint.updatedAt = new Date().toISOString();
    if (assignedManager) {
      complaint.assignedManager = assignedManager;
    }
    this.complaints.set(complaintId, complaint);
    return { ...complaint };
  }

  private checkSimulations(): void {
    if (this.simulateDown) {
      throw new Error(
        'MAD upstream gateway is unreachable (simulated connection refusal).',
      );
    }
    if (this.simulateTimeout) {
      throw new Error('MAD upstream gateway timed out after 5000ms.');
    }
  }
}
