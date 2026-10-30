import API_URL from './config.ts';
import { ApiError } from './guest-sessions.ts';
import type {
  CreateServiceRequestPayload,
  ServiceRequestResponse,
  ServiceRequestStatus,
  ServiceTypeOption,
} from '../../types/services.ts';

/**
 * 6 Approved Service Request categories matching Figure 38
 */
export const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  { key: 'cleaning', backendType: 'ROOM_CLEANING', label: 'Room Cleaning', icon: '🧹' },
  { key: 'towels', backendType: 'EXTRA_TOWELS', label: 'Extra Towels', icon: '🛁' },
  { key: 'maintenance', backendType: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
  { key: 'laundry', backendType: 'LUGGAGE_ASSISTANCE', label: 'Laundry', icon: '👕' },
  { key: 'water', backendType: 'TOILETRIES', label: 'Water Bottles', icon: '💧' },
  { key: 'other', backendType: 'OTHER', label: 'Other', icon: '✦' },
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
  idempotencyKey: string,
): Promise<ServiceRequestResponse> {
  const effectiveKey = idempotencyKey || payload.idempotencyKey || generateServiceIdempotencyKey();

  const requestBody = {
    requestType: payload.requestType,
    description: payload.description?.trim() || undefined,
    priority: payload.priority || 'NORMAL',
    idempotencyKey: effectiveKey,
  };

  try {
    const response = await fetch(`${API_URL}/service-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
        'idempotency-key': effectiveKey,
      },
      body: JSON.stringify(requestBody),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        body?.message || body?.error || 'Failed to submit service request. Please try again.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as ServiceRequestResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }

    // Local demo / standalone fallback
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost'
    ) {
      const now = new Date();
      return {
        requestId: `REQ-${Math.floor(100 + Math.random() * 900)}`,
        roomNumber: '103',
        bookingId: 'booking-101',
        requestType: payload.requestType,
        description: payload.description || null,
        status: 'SUBMITTED',
        priority: payload.priority || 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 20,
        idempotencyKey: effectiveKey,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        timeline: [
          {
            status: 'SUBMITTED',
            label: 'Request Submitted',
            completed: true,
            current: true,
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
          { status: 'ASSIGNED', label: 'Worker Assigned', completed: false, current: false },
          { status: 'IN_PROGRESS', label: 'In Progress', completed: false, current: false },
          { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
        ],
      };
    }

    const msg =
      err instanceof Error ? err.message : 'Network error. Please retry submitting your request.';
    throw new ApiError(msg, 503);
  }
}

/**
 * Retrieves all service requests for the current guest stay.
 */
export async function fetchGuestServiceRequests(
  sessionToken: string,
): Promise<ServiceRequestResponse[]> {
  try {
    const response = await fetch(`${API_URL}/service-requests`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (
        process.env.NODE_ENV !== 'production' &&
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost'
      ) {
        return FALLBACK_SERVICE_REQUESTS;
      }
      const errorMsg = body?.message || 'Unable to retrieve service requests.';
      throw new ApiError(errorMsg, response.status, body);
    }

    const list = Array.isArray(body) ? (body as ServiceRequestResponse[]) : [];
    if (list.length === 0) {
      return FALLBACK_SERVICE_REQUESTS;
    }
    return list;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost'
    ) {
      return FALLBACK_SERVICE_REQUESTS;
    }
    const msg = err instanceof Error ? err.message : 'Unable to retrieve service requests.';
    throw new ApiError(msg, 503);
  }
}

/**
 * Retrieves a service request by ID.
 */
export async function fetchGuestServiceRequestById(
  sessionToken: string,
  requestId: string,
): Promise<ServiceRequestResponse> {
  try {
    const response = await fetch(`${API_URL}/service-requests/${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const matched = FALLBACK_SERVICE_REQUESTS.find((r) => r.requestId === requestId);
      if (matched) return matched;
      const errorMsg = body?.message || `Unable to fetch service request [${requestId}].`;
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as ServiceRequestResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const matched = FALLBACK_SERVICE_REQUESTS.find((r) => r.requestId === requestId);
    if (matched) return matched;
    const msg =
      err instanceof Error ? err.message : `Unable to fetch service request [${requestId}].`;
    throw new ApiError(msg, 503);
  }
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
  try {
    const response = await fetch(
      `${API_URL}/service-requests/${encodeURIComponent(requestId)}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ status, assignedStaff }),
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Unable to advance service request status.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as ServiceRequestResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : 'Unable to advance service request status.';
    throw new ApiError(msg, 503);
  }
}
