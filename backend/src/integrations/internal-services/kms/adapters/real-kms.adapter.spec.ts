import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { KMS_FIXTURE_CREATE_ORDER_VALID } from '../fixtures/kms-contract.fixtures.js';
import { RealKmsAdapter } from './real-kms.adapter.js';

describe('RealKmsAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails closed with UpstreamServiceUnavailableException when baseUrl is missing or empty', async () => {
    const adapter = new RealKmsAdapter('');

    await expect(adapter.getMenuCatalog()).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
    await expect(
      adapter.createOrder(KMS_FIXTURE_CREATE_ORDER_VALID),
    ).rejects.toThrow(UpstreamServiceUnavailableException);
    await expect(adapter.getOrder('order-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
    await expect(adapter.cancelOrder('order-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
  });

  it('executes successful HTTP requests when endpoint is configured', async () => {
    const mockResponseData = { success: true };
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponseData,
    });

    const adapter = new RealKmsAdapter(
      'https://kms.internal.foreverhotel.com',
      'test-kms-key',
    );
    const result = await adapter.getMenuCatalog();

    expect(result).toEqual(mockResponseData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://kms.internal.foreverhotel.com/api/v1/menu',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-KMS-API-Key': 'test-kms-key',
        }),
      }),
    );
  });

  it('throws UpstreamServiceUnavailableException when upstream returns HTTP error status', async () => {
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });

    const adapter = new RealKmsAdapter('https://kms.internal.foreverhotel.com');
    await expect(adapter.getOrder('order-101')).rejects.toThrow(
      UpstreamServiceUnavailableException,
    );
  });
});
