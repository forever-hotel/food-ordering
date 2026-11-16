import { ServiceRequestStatus } from './service-request-status.enum.js';

describe('ServiceRequestStatus', () => {
  it('contains the supported service request states', () => {
    expect(Object.values(ServiceRequestStatus)).toEqual([
      'SUBMITTED',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
  });
});
