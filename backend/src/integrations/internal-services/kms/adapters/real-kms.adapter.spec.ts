import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { KMS_FIXTURE_CREATE_ORDER_VALID } from '../fixtures/kms-contract.fixtures.js';
import { MealPeriod } from '../dto/kms-menu.dto.js';
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
      'test-kms-key-at-least-32-characters',
    );
    const result = await adapter.getMenuCatalog();

    expect(result).toEqual(mockResponseData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://kms.internal.foreverhotel.com/api/v1/guest/menu',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-kms-key-at-least-32-characters',
        }),
      }),
    );
  });

  it('appends mealPeriod query parameter when fetching filtered menu catalog', async () => {
    global.fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });

    const adapter = new RealKmsAdapter(
      'https://kms.internal.foreverhotel.com',
      'test-kms-key-at-least-32-characters',
    );
    await adapter.getMenuCatalog(MealPeriod.BREAKFAST);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://kms.internal.foreverhotel.com/api/v1/guest/menu?mealPeriod=BREAKFAST',
      expect.any(Object),
    );
  });

  describe('createOrder()', () => {
    it('creates an order when items belong to the same kitchen meal period', async () => {
      const mockCatalog = {
        items: [
          {
            id: 'item-1',
            name: 'Pancakes',
            mealPeriods: [MealPeriod.BREAKFAST],
          },
        ],
      };
      const mockOrderResult = {
        orderId: 'order-123',
        status: 'PLACED',
        totalAmount: 1200,
      };

      global.fetch = jest
        .fn<any>()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCatalog,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockOrderResult,
        });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      const result = await adapter.createOrder({
        bookingId: 'b-101',
        roomNumber: '101',
        idempotencyKey: 'idemp-123',
        items: [{ itemId: 'item-1', quantity: 2, specialNotes: 'No butter' }],
        totalAmount: 2400,
      });

      expect(result).toEqual(mockOrderResult);
      const calls = (global.fetch as jest.Mock).mock.calls;
      const sent = JSON.parse(
        (calls[calls.length - 1]![1] as RequestInit).body as string,
      );
      expect(sent.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://kms.internal.foreverhotel.com/api/v1/guest/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mealPeriod":"BREAKFAST"'),
        }),
      );
    });

    it('throws BadRequestException if an item is not found in the menu catalog', async () => {
      const mockCatalog = { items: [] };
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCatalog,
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(
        adapter.createOrder({
          bookingId: 'b-101',
          roomNumber: '101',
          idempotencyKey: 'idemp-123',
          items: [{ itemId: 'missing-item', quantity: 1 }],
          totalAmount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if items span conflicting meal periods', async () => {
      const mockCatalog = {
        items: [
          { id: 'item-1', mealPeriods: [MealPeriod.BREAKFAST] },
          { id: 'item-2', mealPeriods: [MealPeriod.DINNER] },
        ],
      };
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCatalog,
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(
        adapter.createOrder({
          bookingId: 'b-101',
          roomNumber: '101',
          idempotencyKey: 'idemp-123',
          items: [
            { itemId: 'item-1', quantity: 1 },
            { itemId: 'item-2', quantity: 1 },
          ],
          totalAmount: 2500,
        }),
      ).rejects.toThrow(
        new BadRequestException('Items must belong to one kitchen meal period'),
      );
    });
  });

  describe('cancelOrder()', () => {
    it('executes cancel order call with reason', async () => {
      const mockCancelledResult = { orderId: 'order-101', status: 'CANCELLED' };
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCancelledResult,
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      const result = await adapter.cancelOrder(
        'order-101',
        'Guest changed mind',
      );

      expect(result).toEqual(mockCancelledResult);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://kms.internal.foreverhotel.com/api/v1/guest/orders/order-101/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Guest changed mind' }),
        }),
      );
    });
  });

  describe('HTTP Error Status Handling', () => {
    it('maps HTTP 400 to BadRequestException', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(adapter.getOrder('order-101')).rejects.toThrow(
        new BadRequestException('Kitchen rejected invalid order data'),
      );
    });

    it('maps HTTP 404 to NotFoundException', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(adapter.getOrder('order-101')).rejects.toThrow(
        new NotFoundException('Kitchen item or order not found'),
      );
    });

    it('maps HTTP 409 to ConflictException', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: 'Conflict',
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(adapter.getOrder('order-101')).rejects.toThrow(
        new ConflictException('Kitchen order state or availability changed'),
      );
    });

    it('maps network or timeout errors to UpstreamServiceUnavailableException', async () => {
      global.fetch = jest
        .fn<any>()
        .mockRejectedValue(new Error('Connection timed out'));

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(adapter.getOrder('order-101')).rejects.toThrow(
        UpstreamServiceUnavailableException,
      );
    });

    it('throws UpstreamServiceUnavailableException when upstream returns HTTP error status (e.g. 502)', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      });

      const adapter = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'test-kms-key-at-least-32-characters',
      );
      await expect(adapter.getOrder('order-101')).rejects.toThrow(
        UpstreamServiceUnavailableException,
      );
    });
  });

  it('rejects order status transition with ForbiddenException asserting KMS authoritative ownership', async () => {
    const adapter = new RealKmsAdapter(
      'https://kms.internal.foreverhotel.com',
      'test-kms-key-at-least-32-characters',
    );

    await expect(
      adapter.transitionOrderStatus('order-101', 'IN_PREPARATION' as any),
    ).rejects.toThrow(
      'Kitchen order status transitions are strictly owned by KMS. FOSS cannot mutate kitchen order statuses in production.',
    );
  });
});
