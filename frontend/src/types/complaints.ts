/**
 * Frontend Complaint Domain Types & Enums
 * Aligns with Final Design Report Figure 39, SDS §5.2.4 (FOSS-18), and MAD Upstream Contract.
 */

export type ComplaintCategory = 'FOOD' | 'SERVICE' | 'CLEANLINESS' | 'NOISE' | 'AMENITY' | 'OTHER';

export type ComplaintSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ComplaintStatus = 'SUBMITTED' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'ESCALATED';

export interface ComplaintTimelineStep {
  status: ComplaintStatus;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
}

export interface CreateComplaintPayload {
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  subject: string;
  description: string;
  relatedOrderId?: string;
  relatedRequestId?: string;
  idempotencyKey?: string;
}

export interface ComplaintResponse {
  complaintId: string;
  bookingId: string;
  roomNumber: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  subject: string;
  description: string;
  status: ComplaintStatus;
  relatedOrderId?: string | null;
  relatedRequestId?: string | null;
  assignedManager?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: ComplaintTimelineStep[];
}

export interface SourceReferenceOption {
  id: string; // e.g. 'order-291', 'req-041', 'none'
  type: 'order' | 'request' | 'none';
  referenceId?: string;
  label: string;
  subtext?: string;
}
