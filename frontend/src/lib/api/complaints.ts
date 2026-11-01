/**
 * Complaints API Client & Deterministic Fallback Fixtures
 * Connects FOSS frontend with backend ComplaintsModule (and upstream MAD proxy).
 * Traceability: GA-13-15; Final Design Report p25, Figure 39; SDS §5.2.4 (FOSS-18).
 */

import type {
  ComplaintCategory,
  ComplaintSeverity,
  ComplaintStatus,
  ComplaintResponse,
  CreateComplaintPayload,
} from '../../types/complaints.ts';
import { getComplaintsProvider } from '../data-mode/provider-factory.ts';

export interface CategoryOption {
  value: ComplaintCategory;
  label: string;
  iconName?: string;
}

export interface SeverityOption {
  level: ComplaintSeverity;
  label: string;
  color: string;
  activeBg: string;
  activeText: string;
  badgeTag: string;
}

export const COMPLAINT_CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'FOOD', label: 'Food quality & dining' },
  { value: 'SERVICE', label: 'Staff service & attentiveness' },
  { value: 'CLEANLINESS', label: 'Room cleanliness & housekeeping' },
  { value: 'NOISE', label: 'Noise disturbance' },
  { value: 'AMENITY', label: 'Missing or broken amenity' },
  { value: 'OTHER', label: 'Other concern' },
];

export const COMPLAINT_SEVERITY_OPTIONS: SeverityOption[] = [
  {
    level: 'LOW',
    label: 'Low',
    color: '#059669',
    activeBg: '!bg-emerald-600',
    activeText: 'text-white',
    badgeTag: 'Low',
  },
  {
    level: 'MEDIUM',
    label: 'Medium',
    color: '#D97706',
    activeBg: '!bg-amber-500',
    activeText: 'text-white',
    badgeTag: 'Medium',
  },
  {
    level: 'HIGH',
    label: 'High ✓',
    color: '#DC2626',
    activeBg: '!bg-red-600',
    activeText: 'text-white',
    badgeTag: 'High',
  },
  {
    level: 'URGENT',
    label: 'Urgent ⚠️',
    color: '#7F1D1D',
    activeBg: '!bg-red-900',
    activeText: 'text-white',
    badgeTag: 'Urgent',
  },
];

/**
 * Generates client-side idempotency keys for complaint submissions.
 */
export function generateComplaintIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cmp-idem-${crypto.randomUUID()}`;
  }
  return `cmp-idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Deterministic fallback complaints matching Figure 39 and evaluator expectations.
 */
export const FALLBACK_COMPLAINTS: ComplaintResponse[] = [
  {
    complaintId: 'CMP-20261030-F001',
    bookingId: 'booking-stay-103',
    roomNumber: '103',
    category: 'FOOD',
    severity: 'HIGH',
    subject: 'Cold and undercooked chicken delivered',
    description: 'The chicken in order #ORD-291 was undercooked and cold on arrival.',
    status: 'UNDER_INVESTIGATION',
    relatedOrderId: 'order-291',
    relatedRequestId: null,
    assignedManager: 'Duty Manager Sarah K.',
    resolutionNotes: null,
    createdAt: '2026-10-30T13:10:00.000Z',
    updatedAt: '2026-10-30T13:25:00.000Z',
    timeline: [
      {
        status: 'SUBMITTED',
        label: 'Complaint Submitted',
        completed: true,
        current: false,
        timestamp: '13:10',
      },
      {
        status: 'UNDER_INVESTIGATION',
        label: 'Under Investigation',
        completed: true,
        current: true,
        timestamp: '13:25',
      },
      {
        status: 'ESCALATED',
        label: 'Escalated to GM',
        completed: false,
        current: false,
      },
      {
        status: 'RESOLVED',
        label: 'Resolved',
        completed: false,
        current: false,
      },
    ],
  },
  {
    complaintId: 'CMP-20261029-N002',
    bookingId: 'booking-stay-103',
    roomNumber: '103',
    category: 'NOISE',
    severity: 'MEDIUM',
    subject: 'Excessive corridor noise during quiet hours',
    description: 'Loud housekeeping cart movements at 1:30 AM outside room 103.',
    status: 'RESOLVED',
    relatedOrderId: null,
    relatedRequestId: 'req-041',
    assignedManager: 'Night Operations Lead Priyantha M.',
    resolutionNotes: 'Night team cautioned; rubber-wheeled service carts deployed.',
    createdAt: '2026-10-29T21:40:00.000Z',
    updatedAt: '2026-10-29T22:15:00.000Z',
    timeline: [
      {
        status: 'SUBMITTED',
        label: 'Complaint Submitted',
        completed: true,
        current: false,
        timestamp: '21:40',
      },
      {
        status: 'UNDER_INVESTIGATION',
        label: 'Under Investigation',
        completed: true,
        current: false,
        timestamp: '21:55',
      },
      {
        status: 'RESOLVED',
        label: 'Resolved',
        completed: true,
        current: true,
        timestamp: '22:15',
      },
    ],
  },
];

/**
 * Submits a new guest complaint with idempotency protection.
 */
export async function createComplaint(
  payload: CreateComplaintPayload,
  sessionToken: string,
  idempotencyKey?: string,
): Promise<ComplaintResponse> {
  return getComplaintsProvider().createComplaint(payload, sessionToken, idempotencyKey);
}

/**
 * Fetches all complaints filed for the current active guest stay.
 */
export async function fetchGuestComplaints(sessionToken: string): Promise<ComplaintResponse[]> {
  return getComplaintsProvider().fetchGuestComplaints(sessionToken);
}

/**
 * Retrieves full details and timeline progression for a specific complaint.
 */
export async function fetchGuestComplaintById(
  id: string,
  sessionToken: string,
): Promise<ComplaintResponse> {
  const normalizedId = id.replace(/^#/, '');
  return getComplaintsProvider().fetchGuestComplaintById(sessionToken, normalizedId);
}

/**
 * Advances demo complaint status for evaluator flows.
 */
export async function advanceComplaintStatusDemo(
  id: string,
  nextStatus: ComplaintStatus,
  sessionToken: string,
  notes?: string,
): Promise<ComplaintResponse> {
  const normalizedId = id.replace(/^#/, '');
  return getComplaintsProvider().advanceDemoComplaintStatus(
    sessionToken,
    normalizedId,
    nextStatus,
    notes,
  );
}

export async function advanceDemoComplaintStatus(
  sessionToken: string,
  complaintId: string,
  newStatus: ComplaintStatus,
  resolutionNotes?: string,
): Promise<ComplaintResponse> {
  const normalizedId = complaintId.replace(/^#/, '');
  return getComplaintsProvider().advanceDemoComplaintStatus(
    sessionToken,
    normalizedId,
    newStatus,
    resolutionNotes,
  );
}
