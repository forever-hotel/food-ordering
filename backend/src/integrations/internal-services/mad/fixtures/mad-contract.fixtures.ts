import { ComplaintStatus } from '../../../../modules/complaints/enums/complaint-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import {
  ComplaintCategory,
  ComplaintSeverity,
  MadCreateComplaintDto,
} from '../dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../dto/mad-complaint-result.dto.js';

export const MAD_FIXTURE_CREATE_COMPLAINT_VALID: MadCreateComplaintDto = {
  complaintId: 'complaint-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  category: ComplaintCategory.FOOD,
  severity: ComplaintSeverity.MEDIUM,
  subject: 'Soup delivered cold',
  description:
    'The mushroom arancini and soup were lukewarm when brought to room 101.',
  relatedOrderId: 'order-fixture-001',
  idempotencyKey: 'idemp-mad-fixture-001',
  version: ContractVersion.V1_0,
};

export const MAD_FIXTURE_COMPLAINT_SUBMITTED: MadComplaintResultDto = {
  complaintId: 'complaint-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  category: ComplaintCategory.FOOD,
  severity: ComplaintSeverity.MEDIUM,
  subject: 'Soup delivered cold',
  description:
    'The mushroom arancini and soup were lukewarm when brought to room 101.',
  status: ComplaintStatus.SUBMITTED,
  relatedOrderId: 'order-fixture-001',
  relatedTaskId: null,
  assignedManager: null,
  resolutionNotes: null,
  createdAt: '2026-10-28T12:00:00.000Z',
  updatedAt: '2026-10-28T12:00:00.000Z',
  version: ContractVersion.V1_0,
};

export const MAD_FIXTURE_COMPLAINT_UNDER_INVESTIGATION: MadComplaintResultDto =
  {
    ...MAD_FIXTURE_COMPLAINT_SUBMITTED,
    status: ComplaintStatus.UNDER_INVESTIGATION,
    assignedManager: 'Duty Manager Karen W.',
    updatedAt: '2026-10-28T12:05:00.000Z',
  };

export const MAD_FIXTURE_COMPLAINT_RESOLVED: MadComplaintResultDto = {
  ...MAD_FIXTURE_COMPLAINT_SUBMITTED,
  status: ComplaintStatus.RESOLVED,
  assignedManager: 'Duty Manager Karen W.',
  resolutionNotes:
    'Spoke with guest directly, ordered fresh hot dishes and waived delivery charge.',
  updatedAt: '2026-10-28T12:20:00.000Z',
};

export const MAD_FIXTURE_COMPLAINT_ESCALATED: MadComplaintResultDto = {
  ...MAD_FIXTURE_COMPLAINT_SUBMITTED,
  status: ComplaintStatus.ESCALATED,
  severity: ComplaintSeverity.URGENT,
  assignedManager: 'General Manager Assistant',
  updatedAt: '2026-10-28T12:15:00.000Z',
};

/**
 * Legacy v1 producer payload omitting optional resolutionNotes and assignedManager
 */
export const MAD_FIXTURE_LEGACY_V1_COMPLAINT = {
  complaintId: 'complaint-legacy-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  category: 'NOISE',
  severity: 'LOW',
  subject: 'Loud hallway chatter',
  description: 'Elevator noise nearby',
  status: ComplaintStatus.SUBMITTED,
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
  version: '1.0',
};

/**
 * Forward-compatible payload containing newer additive fields
 */
export const MAD_FIXTURE_ADDITIVE_COMPLAINT = {
  ...MAD_FIXTURE_COMPLAINT_SUBMITTED,
  complaintId: 'complaint-additive-001',
  guestFolioImpact: 'COMP_DISH_APPLIED',
  customerSatisfactionScore: 4,
  internalAuditFlag: false,
};

export const MAD_FIXTURE_MALFORMED_COMPLAINT = {
  complaintId: '',
  category: 'UNKNOWN_CATEGORY_INVALID',
  severity: 'OFF_SCALE',
};
