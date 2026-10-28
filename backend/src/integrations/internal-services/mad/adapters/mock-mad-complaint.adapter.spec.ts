import { beforeEach, describe, expect, it } from '@jest/globals';
import { ComplaintStatus } from '../../../../modules/complaints/enums/complaint-status.enum.js';
import {
  ComplaintCategory,
  ComplaintSeverity,
} from '../dto/mad-complaint.dto.js';
import { MAD_FIXTURE_CREATE_COMPLAINT_VALID } from '../fixtures/mad-contract.fixtures.js';
import { MockMadComplaintAdapter } from './mock-mad-complaint.adapter.js';

describe('MockMadComplaintAdapter', () => {
  let adapter: MockMadComplaintAdapter;

  beforeEach(() => {
    adapter = new MockMadComplaintAdapter();
  });

  it('files a complaint successfully and stores deterministic state', async () => {
    const complaint = await adapter.fileComplaint({
      ...MAD_FIXTURE_CREATE_COMPLAINT_VALID,
      idempotencyKey: 'fresh-mad-key-1',
    });

    expect(complaint.complaintId).toBeDefined();
    expect(complaint.status).toBe(ComplaintStatus.SUBMITTED);
    expect(complaint.roomNumber).toBe('101');
    expect(complaint.category).toBe(ComplaintCategory.FOOD);
    expect(complaint.severity).toBe(ComplaintSeverity.MEDIUM);

    const fetched = await adapter.getComplaint(complaint.complaintId);
    expect(fetched).toEqual(complaint);
  });

  it('replays existing complaint when duplicate idempotency key is submitted', async () => {
    const key = 'test-mad-replay-key';
    const firstCall = await adapter.fileComplaint({
      ...MAD_FIXTURE_CREATE_COMPLAINT_VALID,
      idempotencyKey: key,
    });

    const secondCall = await adapter.fileComplaint({
      ...MAD_FIXTURE_CREATE_COMPLAINT_VALID,
      idempotencyKey: key,
    });

    expect(secondCall.complaintId).toBe(firstCall.complaintId);
    expect(secondCall.createdAt).toBe(firstCall.createdAt);
  });

  it('transitions complaint status through investigation and resolution', async () => {
    const complaintId = 'complaint-fixture-001';

    const underInvestigation = adapter.transitionStatus(
      complaintId,
      ComplaintStatus.UNDER_INVESTIGATION,
      'Duty Manager Laura',
    );
    expect(underInvestigation.status).toBe(ComplaintStatus.UNDER_INVESTIGATION);
    expect(underInvestigation.assignedManager).toBe('Duty Manager Laura');

    const resolved = await adapter.resolveComplaint(
      complaintId,
      'Replacement food dispatched with complimentary wine',
    );
    expect(resolved.status).toBe(ComplaintStatus.RESOLVED);
    expect(resolved.resolutionNotes).toBe(
      'Replacement food dispatched with complimentary wine',
    );
  });

  it('simulates outage and timeout when flags are enabled', async () => {
    adapter.setSimulateDown(true);
    await expect(adapter.getComplaint('complaint-fixture-001')).rejects.toThrow(
      'simulated connection refusal',
    );

    adapter.setSimulateDown(false);
    adapter.setSimulateTimeout(true);
    await expect(
      adapter.resolveComplaint('complaint-fixture-001', 'notes'),
    ).rejects.toThrow('timed out after 5000ms');
  });

  it('resets to default fixture state', async () => {
    adapter.setSimulateDown(true);
    adapter.reset();

    const complaint = await adapter.getComplaint('complaint-fixture-001');
    expect(complaint).toBeDefined();
    expect(complaint?.status).toBe(ComplaintStatus.SUBMITTED);
  });
});
