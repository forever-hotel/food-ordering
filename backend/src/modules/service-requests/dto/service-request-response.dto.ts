import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';

export class ServiceRequestResponseDto {
  requestId!: string;
  roomNumber!: string;
  requestType!: string;
  description!: string | null;
  status!: ServiceRequestStatus;
  createdAt!: string;
}
