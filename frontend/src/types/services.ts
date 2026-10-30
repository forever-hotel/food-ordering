export type ServiceRequestStatus = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

export type ServiceTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface ServiceTypeOption {
  key: string;
  backendType: string;
  label: string;
  icon: string;
}

export interface CreateServiceRequestPayload {
  requestType: string;
  description?: string;
  priority?: ServiceTaskPriority;
  idempotencyKey?: string;
}

export interface ServiceRequestTimelineStep {
  status: ServiceRequestStatus;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
}

export interface ServiceRequestResponse {
  requestId: string;
  roomNumber: string;
  bookingId: string;
  requestType: string;
  description: string | null;
  status: ServiceRequestStatus;
  priority: ServiceTaskPriority;
  assignedStaff?: string | null;
  estimatedCompletionMinutes: number;
  taskId?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  timeline: ServiceRequestTimelineStep[];
}
