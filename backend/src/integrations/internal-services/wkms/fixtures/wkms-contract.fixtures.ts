import { ServiceRequestStatus } from '../../../../modules/service-requests/enums/service-request-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import {
  TaskPriority,
  TaskType,
  WkmsCreateTaskDto,
} from '../dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../dto/wkms-task-result.dto.js';

export const WKMS_FIXTURE_CREATE_TASK_VALID: WkmsCreateTaskDto = {
  taskId: 'task-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  taskType: TaskType.EXTRA_TOWELS,
  description: 'Please provide two extra bath towels and a bath mat',
  priority: TaskPriority.NORMAL,
  idempotencyKey: 'idemp-wkms-fixture-001',
  version: ContractVersion.V1_0,
};

export const WKMS_FIXTURE_TASK_SUBMITTED: WkmsTaskResultDto = {
  taskId: 'task-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  taskType: TaskType.EXTRA_TOWELS,
  description: 'Please provide two extra bath towels and a bath mat',
  status: ServiceRequestStatus.SUBMITTED,
  priority: TaskPriority.NORMAL,
  assignedStaff: null,
  estimatedCompletionMinutes: 20,
  createdAt: '2026-10-28T12:00:00.000Z',
  updatedAt: '2026-10-28T12:00:00.000Z',
  version: ContractVersion.V1_0,
};

export const WKMS_FIXTURE_TASK_ASSIGNED: WkmsTaskResultDto = {
  ...WKMS_FIXTURE_TASK_SUBMITTED,
  status: ServiceRequestStatus.ASSIGNED,
  assignedStaff: 'Housekeeper Maria S.',
  estimatedCompletionMinutes: 15,
  updatedAt: '2026-10-28T12:05:00.000Z',
};

export const WKMS_FIXTURE_TASK_IN_PROGRESS: WkmsTaskResultDto = {
  ...WKMS_FIXTURE_TASK_SUBMITTED,
  status: ServiceRequestStatus.IN_PROGRESS,
  assignedStaff: 'Housekeeper Maria S.',
  estimatedCompletionMinutes: 5,
  updatedAt: '2026-10-28T12:10:00.000Z',
};

export const WKMS_FIXTURE_TASK_COMPLETED: WkmsTaskResultDto = {
  ...WKMS_FIXTURE_TASK_SUBMITTED,
  status: ServiceRequestStatus.COMPLETED,
  assignedStaff: 'Housekeeper Maria S.',
  estimatedCompletionMinutes: 0,
  updatedAt: '2026-10-28T12:15:00.000Z',
};

/**
 * Legacy v1 producer payload omitting optional assignedStaff and estimatedCompletionMinutes
 */
export const WKMS_FIXTURE_LEGACY_V1_TASK = {
  taskId: 'task-legacy-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  taskType: 'ROOM_CLEANING',
  description: null,
  status: ServiceRequestStatus.SUBMITTED,
  priority: 'NORMAL',
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  version: '1.0',
};

/**
 * Forward-compatible payload containing newer additive fields
 */
export const WKMS_FIXTURE_ADDITIVE_TASK = {
  ...WKMS_FIXTURE_TASK_SUBMITTED,
  taskId: 'task-additive-001',
  dispatchGroup: 'HOUSEKEEPING_NORTH_WING',
  dispatcherId: 'dispatch-user-88',
  safetyCheckPassed: true,
  completionSignature: 'sig-worker-772',
};

export const WKMS_FIXTURE_MALFORMED_TASK = {
  taskId: '', // empty id
  roomNumber: null, // missing room
  status: 'NON_EXISTENT_STATUS',
};
