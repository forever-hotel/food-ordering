import type {
  CreateServiceRequestPayload,
  ServiceRequestResponse,
  ServiceRequestStatus,
  ServiceTypeOption,
} from '../../types/services.ts';
import { getServicesProvider } from '../data-mode/provider-factory.ts';

/**
 * 6 Approved Service Request categories matching Figure 38
 */
export const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  { key: 'cleaning', backendType: 'ROOM_CLEANING', label: 'Room Cleaning', iconKey: 'cleaning' },
  { key: 'towels', backendType: 'EXTRA_TOWELS', label: 'Extra Towels', iconKey: 'towels' },
  { key: 'maintenance', backendType: 'MAINTENANCE', label: 'Maintenance', iconKey: 'maintenance' },
  { key: 'laundry', backendType: 'LAUNDRY_PICKUP', label: 'Laundry', iconKey: 'laundry' },
  {
    key: 'toiletries',
    backendType: 'TOILETRIES',
    label: 'Toiletries',
    iconKey: 'toiletries',
    disabled: true,
  },
  { key: 'other', backendType: 'OTHER', label: 'Other', iconKey: 'other' },
];

/**
 * Generates client-side unique idempotency key for service request submissions.
 */
export function generateServiceIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `idemp-svc-${crypto.randomUUID()}`;
  }
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `idemp-svc-${timestamp}-${randomPart}`;
}

/**
 * Deterministic fallback service requests matching Figure 38 for offline resilience.
 */
export const FALLBACK_SERVICE_REQUESTS: ServiceRequestResponse[] = [
  {
    requestId: 'REQ-042',
    roomNumber: '103',
    bookingId: 'booking-101',
    requestType: 'EXTRA_TOWELS',
    description: 'Please bring 2 extra bath towels',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    assignedStaff: 'Worker en route',
    estimatedCompletionMinutes: 15,
    taskId: 'task-wkms-042',
    idempotencyKey: 'idemp-demo-req-042',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    timeline: [
      {
        status: 'SUBMITTED',
        label: 'Request Submitted',
        completed: true,
        current: false,
        timestamp: '13:30',
      },
      {
        status: 'ASSIGNED',
        label: 'Worker Assigned',
        completed: true,
        current: true,
        timestamp: '13:45 · Now',
      },
      {
        status: 'IN_PROGRESS',
        label: 'In Progress',
        completed: false,
        current: false,
      },
      {
        status: 'COMPLETED',
        label: 'Completed',
        completed: false,
        current: false,
      },
    ],
  },
  {
    requestId: 'REQ-041',
    roomNumber: '103',
    bookingId: 'booking-101',
    requestType: 'ROOM_CLEANING',
    description: 'Morning housekeeping please',
    status: 'COMPLETED',
    priority: 'NORMAL',
    assignedStaff: 'Amali S.',
    estimatedCompletionMinutes: 0,
    taskId: 'task-wkms-041',
    idempotencyKey: 'idemp-demo-req-041',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    timeline: [
      {
        status: 'SUBMITTED',
        label: 'Request Submitted',
        completed: true,
        current: false,
        timestamp: '09:45',
      },
      {
        status: 'ASSIGNED',
        label: 'Worker Assigned',
        completed: true,
        current: false,
        timestamp: '10:00',
      },
      {
        status: 'IN_PROGRESS',
        label: 'In Progress',
        completed: true,
        current: false,
        timestamp: '10:15',
      },
      {
        status: 'COMPLETED',
        label: 'Completed',
        completed: true,
        current: true,
        timestamp: '10:30',
      },
    ],
  },
];

/**
 * Submits a new room-bound service request atomically to WKMS via the FOSS backend.
 */
export async function createServiceRequest(
  sessionToken: string,
  payload: CreateServiceRequestPayload,
  idempotencyKey?: string,
): Promise<ServiceRequestResponse> {
  return getServicesProvider().createServiceRequest(sessionToken, payload, idempotencyKey);
}

/**
 * Retrieves all service requests for the current guest stay.
 */
export async function fetchGuestServiceRequests(
  sessionToken: string,
): Promise<ServiceRequestResponse[]> {
  return getServicesProvider().fetchGuestServiceRequests(sessionToken);
}

/**
 * Retrieves a service request by ID.
 */
export async function fetchGuestServiceRequestById(
  sessionToken: string,
  requestId: string,
): Promise<ServiceRequestResponse> {
  const normalizedId = requestId.replace(/^#/, '');
  return getServicesProvider().fetchGuestServiceRequestById(sessionToken, normalizedId);
}

/**
 * Advances service request status (gated by DEMO_MODE).
 */
export async function advanceServiceRequestStatusDemo(
  sessionToken: string,
  requestId: string,
  status: ServiceRequestStatus,
  assignedStaff?: string,
): Promise<ServiceRequestResponse> {
  const normalizedId = requestId.replace(/^#/, '');
  return getServicesProvider().advanceDemoServiceRequestStatus(
    sessionToken,
    normalizedId,
    status,
    assignedStaff,
  );
}

export async function advanceDemoServiceRequestStatus(
  sessionToken: string,
  requestId: string,
  newStatus: ServiceRequestStatus,
  assignedStaff?: string,
): Promise<ServiceRequestResponse> {
  const normalizedId = requestId.replace(/^#/, '');
  return getServicesProvider().advanceDemoServiceRequestStatus(
    sessionToken,
    normalizedId,
    newStatus,
    assignedStaff,
  );
}
