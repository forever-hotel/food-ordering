import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

export interface ServiceRequestStatusUpdatedEvent {
  requestId: string;
  roomNumber: string;
  status: ServiceRequestStatus;
  occurredAt: string;
}
