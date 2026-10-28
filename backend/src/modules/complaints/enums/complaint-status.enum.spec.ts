import { describe, expect, it } from '@jest/globals';
import { ComplaintStatus } from './complaint-status.enum.js';

describe('ComplaintStatus', () => {
  it('contains all valid complaint status states', () => {
    expect(Object.values(ComplaintStatus)).toEqual([
      'SUBMITTED',
      'UNDER_INVESTIGATION',
      'RESOLVED',
      'ESCALATED',
    ]);
  });
});
