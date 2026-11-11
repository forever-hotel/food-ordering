import type { ComplaintsProvider } from '../interfaces.ts';
import type {
  ComplaintResponse,
  CreateComplaintPayload,
  ComplaintStatus,
} from '../../../types/complaints.ts';
import { DemoStateStore } from './demo-state-store.ts';

export class DemoComplaintsProvider implements ComplaintsProvider {
  private readonly store = DemoStateStore.getInstance();

  async fetchGuestComplaints(sessionToken?: string): Promise<ComplaintResponse[]> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.getComplaintsForStay(stay.bookingId, stay.roomNumber);
  }

  async fetchGuestComplaintById(
    sessionToken: string | undefined,
    complaintId: string,
  ): Promise<ComplaintResponse> {
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.getComplaintById(complaintId, stay);
  }

  async createComplaint(
    payload: CreateComplaintPayload,
    sessionToken?: string,
    _idempotencyKey?: string,
  ): Promise<ComplaintResponse> {
    void _idempotencyKey;
    const stay = this.store.resolveStayByToken(sessionToken || '');
    return this.store.createComplaint(stay, payload);
  }

  async advanceDemoComplaintStatus(
    sessionToken: string,
    complaintId: string,
    newStatus: ComplaintStatus,
    resolutionNotes?: string,
  ): Promise<ComplaintResponse> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.advanceComplaintStatus(stay, complaintId, newStatus, resolutionNotes);
  }
}
