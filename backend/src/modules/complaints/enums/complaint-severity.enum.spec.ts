import { describe, expect, it } from '@jest/globals';
import { ComplaintSeverity } from './complaint-severity.enum.js';

describe('ComplaintSeverity', () => {
  it('contains all valid complaint severity levels', () => {
    expect(Object.values(ComplaintSeverity)).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT',
    ]);
  });
});
