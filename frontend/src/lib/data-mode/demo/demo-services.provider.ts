import type { ServicesProvider } from '../interfaces.ts';
import type {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  ServiceRequestStatus,
} from '../../../types/services.ts';
import { DemoStateStore } from './demo-state-store.ts';

export class DemoServicesProvider implements ServicesProvider {
  private readonly store = DemoStateStore.getInstance();

  async fetchGuestServiceRequests(sessionToken: string): Promise<ServiceRequestResponse[]> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.getServiceRequestsForStay(stay.bookingId, stay.roomNumber);
  }

  async fetchGuestServiceRequestById(
    sessionToken: string,
    requestId: string,
  ): Promise<ServiceRequestResponse> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.getServiceRequestById(requestId, stay);
  }

  async createServiceRequest(
    sessionToken: string,
    payload: CreateServiceRequestPayload,
    idempotencyKey?: string,
  ): Promise<ServiceRequestResponse> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.createServiceRequest(stay, payload, idempotencyKey);
  }

  async advanceDemoServiceRequestStatus(
    sessionToken: string,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): Promise<ServiceRequestResponse> {
    const stay = this.store.resolveStayByToken(sessionToken);
    return this.store.advanceServiceRequestStatus(stay, requestId, newStatus, assignedStaff);
  }
}
