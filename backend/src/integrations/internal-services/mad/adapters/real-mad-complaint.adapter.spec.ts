import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { MAD_FIXTURE_CREATE_COMPLAINT_VALID } from '../fixtures/mad-contract.fixtures.js';
import { RealMadComplaintAdapter } from './real-mad-complaint.adapter.js';

describe('RealMadComplaintAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails closed when baseUrl is unconfigured', async () => {
    const adapter = new RealMadComplaintAdapter('');

    await expect(
      adapter.fileComplaint(MAD_FIXTURE_CREATE_COMPLAINT_VALID),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
    await expect(adapter.getComplaint('complaint-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
    await expect(
      adapter.resolveComplaint('complaint-101', 'resolved'),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
  });

  it('executes successful HTTP requests when endpoint is configured', async () => {
    const mockData = { success: true };
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const adapter = new RealMadComplaintAdapter(
      'https://mad.internal.foreverhotel.com',
      'test-mad-key',
    );
    const result = await adapter.getComplaint('complaint-101');

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://mad.internal.foreverhotel.com/api/v1/complaints/complaint-101',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-MAD-API-Key': 'test-mad-key',
        }),
      }),
    );
  });

  it('throws UpstreamServiceUnavailableException on HTTP error', async () => {
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const adapter = new RealMadComplaintAdapter(
      'https://mad.internal.foreverhotel.com',
    );
    await expect(
      adapter.resolveComplaint('complaint-101', 'notes'),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
  });
});
