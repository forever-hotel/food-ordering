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
 * Submits a new room-bound service request atomically to WKMS via the FOSS backend.
 */
export async function createServiceRequest(
  sessionToken: string | undefined,
  payload: CreateServiceRequestPayload,
  idempotencyKey?: string,
): Promise<ServiceRequestResponse> {
  return getServicesProvider().createServiceRequest(sessionToken, payload, idempotencyKey);
}

/**
 * Retrieves all service requests for the current guest stay.
 */
export async function fetchGuestServiceRequests(
  sessionToken?: string,
): Promise<ServiceRequestResponse[]> {
  return getServicesProvider().fetchGuestServiceRequests(sessionToken);
}

/**
 * Retrieves a service request by ID.
 */
export async function fetchGuestServiceRequestById(
  sessionToken: string | undefined,
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
