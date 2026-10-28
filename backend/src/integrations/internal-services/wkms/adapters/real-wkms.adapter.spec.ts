import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { WKMS_FIXTURE_CREATE_TASK_VALID } from '../fixtures/wkms-contract.fixtures.js';
import { RealWkmsAdapter } from './real-wkms.adapter.js';

describe('RealWkmsAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails closed when baseUrl is unconfigured', async () => {
    const adapter = new RealWkmsAdapter('');

    await expect(
      adapter.createTask(WKMS_FIXTURE_CREATE_TASK_VALID),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
    await expect(adapter.getTask('task-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
    await expect(adapter.cancelTask('task-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
  });

  it('executes successful HTTP requests when endpoint is configured', async () => {
    const mockData = { success: true };
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const adapter = new RealWkmsAdapter(
      'https://wkms.internal.foreverhotel.com',
      'test-wkms-key',
    );
    const result = await adapter.getTask('task-101');

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://wkms.internal.foreverhotel.com/api/v1/tasks/task-101',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-WKMS-API-Key': 'test-wkms-key',
        }),
      }),
    );
  });

  it('throws UpstreamServiceUnavailableException on HTTP error', async () => {
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
    });

    const adapter = new RealWkmsAdapter(
      'https://wkms.internal.foreverhotel.com',
    );
    await expect(adapter.cancelTask('task-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
  });
});
