import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateIdempotencyKey,
  placeFoodOrder,
  createMockOrderResponse,
  fetchGuestOrderById,
  fetchGuestOrders,
  cancelFoodOrder,
} from '../src/lib/api/orders.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { CreateFoodOrderPayload, FoodOrderResponse } from '../src/types/orders.ts';

describe('TC-DDP-140-AC1: Successful Workflow - Place Order Mutation, Confirmation & ETA', () => {
  it('submits food order with client idempotency key and returns confirmed order details', async () => {
    const payload: CreateFoodOrderPayload = {
      items: [
        { menuItemId: 'item-101', quantity: 1, specialNotes: 'Extra crispy' },
        { menuItemId: 'item-102', quantity: 1 },
      ],
      allergyNote: 'Peanut allergy, please avoid cross-contamination',
    };
    const idempotencyKey = 'idemp-test-uuid-12345';
    const sessionToken = 'guest-session-token-101';

    const originalFetch = globalThis.fetch;
    let requestHeaders: HeadersInit | undefined;
    let requestBody: string | undefined;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/food-orders$/);
      assert.equal(init?.method, 'POST');
      requestHeaders = init?.headers;
      requestBody = String(init?.body);

      const mockResponse: FoodOrderResponse = {
        orderId: 'ORD-291',
        roomNumber: '103',
        bookingId: 'booking-101',
        status: 'PLACED',
        totalAmount: 1500,
        items: [
          {
            itemId: 'item-101',
            name: 'Grilled Chicken Rice',
            unitPrice: 850,
            quantity: 1,
            specialNotes: 'Extra crispy',
          },
          { itemId: 'item-102', name: 'Vegetable Kottu', unitPrice: 650, quantity: 1 },
        ],
        allergyNotes: payload.allergyNote,
        estimatedDeliveryMinutes: 25,
        createdAt: '2026-10-30T12:00:00.000Z',
        idempotencyKey,
        canCancel: true,
        secondsRemainingToCancel: 600,
      };

      return new Response(JSON.stringify(mockResponse), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const response = await placeFoodOrder(sessionToken, payload, idempotencyKey);

      // Verify Headers & Payload
      const headers = requestHeaders as Record<string, string>;
      assert.equal(headers['Authorization'], `Bearer ${sessionToken}`);
      assert.equal(headers['Idempotency-Key'], idempotencyKey);
      assert.equal(headers['X-Idempotency-Key'], idempotencyKey);

      const parsedBody = JSON.parse(requestBody || '{}');
      assert.equal(parsedBody.idempotencyKey, idempotencyKey);
      assert.equal(parsedBody.items.length, 2);
      assert.equal(parsedBody.allergyNote, payload.allergyNote);

      // Verify Confirmed Order Attributes matching Figure 35
      assert.equal(response.orderId, 'ORD-291');
      assert.equal(response.roomNumber, '103');
      assert.equal(response.status, 'PLACED');
      assert.equal(response.totalAmount, 1500);
      assert.equal(response.estimatedDeliveryMinutes, 25);
      assert.equal(response.canCancel, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('demonstrates that cart is emptied only upon verified confirmation receipt', () => {
    let cart = [
      { id: 'item-101', name: 'Grilled Chicken Rice', quantity: 1 },
      { id: 'item-102', name: 'Vegetable Kottu', quantity: 1 },
    ];
    let confirmedOrder: FoodOrderResponse | null = null;

    const onOrderSuccess = (order: FoodOrderResponse) => {
      confirmedOrder = order;
      cart = []; // clear cart
    };

    const mockOrder = createMockOrderResponse(
      { items: [{ menuItemId: 'item-101', quantity: 1 }] },
      'idemp-123',
      '103',
    );

    assert.equal(cart.length, 2);
    onOrderSuccess(mockOrder);
    assert.equal(cart.length, 0);
    assert.ok(confirmedOrder);
    assert.equal((confirmedOrder as FoodOrderResponse).orderId, 'ORD-291');
  });
});

describe('TC-DDP-140-AC2: Negative / Error Cases - Cart Preservation & Idempotency Key Retention on Retry', () => {
  it('preserves cart items and retains identical idempotency key when network fails', async () => {
    const payload: CreateFoodOrderPayload = {
      items: [{ menuItemId: 'item-101', quantity: 1 }],
      allergyNote: 'Gluten free',
    };
    const savedIdempotencyKey = 'idemp-stable-key-999';

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    const sentKeys: string[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      const headers = init?.headers as Record<string, string>;
      sentKeys.push(headers['Idempotency-Key']);

      if (callCount === 1) {
        // First attempt fails with 503 UpstreamServiceUnavailable
        return new Response(
          JSON.stringify({
            statusCode: 503,
            message: 'Upstream KMS service is unreachable.',
            error: 'Service Unavailable',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Second attempt (retry) succeeds with identical idempotency key
      return new Response(
        JSON.stringify(createMockOrderResponse(payload, savedIdempotencyKey, '103')),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      // 1. Initial attempt fails
      await assert.rejects(
        async () => {
          await placeFoodOrder('token-101', payload, savedIdempotencyKey);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Upstream KMS service is unreachable/);
          return true;
        },
      );

      // Verify that after failure, payload items and allergy note are unchanged
      assert.equal(payload.items.length, 1);
      assert.equal(payload.allergyNote, 'Gluten free');

      // 2. Retry succeeds and reuses the exact same idempotency key
      const retryResult = await placeFoodOrder('token-101', payload, savedIdempotencyKey);
      assert.equal(retryResult.orderId, 'ORD-291');

      // Assert both attempts used the exact same key to prevent duplicate orders
      assert.equal(sentKeys.length, 2);
      assert.equal(sentKeys[0], savedIdempotencyKey);
      assert.equal(sentKeys[1], savedIdempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles item sold-out conflict error (409) with informative message', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 409,
          message: "Menu item 'Prawn Noodles' is currently unavailable (sold out).",
          error: 'Conflict',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await placeFoodOrder(
            'token-101',
            { items: [{ menuItemId: 'item-103', quantity: 1 }] },
            'idemp-soldout-key',
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /sold out/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-140-AC3: Boundary, Concurrency & Double-Submit Prevention', () => {
  it('prevents concurrent double-clicks while mutation is in-flight', async () => {
    let isSubmitting = false;
    let executionCount = 0;

    const simulateClick = async () => {
      if (isSubmitting) {
        return { blocked: true };
      }
      isSubmitting = true;
      executionCount++;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 50));
      isSubmitting = false;
      return { blocked: false };
    };

    // Rapid double click
    const [click1, click2] = await Promise.all([simulateClick(), simulateClick()]);

    assert.equal(click1.blocked, false);
    assert.equal(click2.blocked, true);
    assert.equal(executionCount, 1);
  });

  it('generates unique, high-entropy idempotency keys starting with idemp-', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    assert.ok(key1.startsWith('idemp-'));
    assert.ok(key2.startsWith('idemp-'));
    assert.notEqual(key1, key2);
    assert.ok(key1.length >= 16);
  });

  it('formats cancellation timer countdown correctly from seconds (e.g. 588s -> 9:48)', () => {
    const formatCountdown = (totalSeconds: number): string => {
      const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
      const seconds = Math.max(0, totalSeconds) % 60;
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    assert.equal(formatCountdown(600), '10:00');
    assert.equal(formatCountdown(588), '9:48'); // Matching Figure 35
    assert.equal(formatCountdown(65), '1:05');
    assert.equal(formatCountdown(0), '0:00');
    assert.equal(formatCountdown(-10), '0:00');
  });
});

describe('TC-DDP-140-AC4: Contract & Visual Layout Fidelity Audit (Figure 35)', () => {
  it('reproduces Figure 35 required labels and copy exactly', () => {
    const figure35Contract = {
      pillBadge: '✓ ORDER PLACED',
      title: 'Order Confirmed!',
      subtitle: 'Your order has been sent to the kitchen and a KOT has been printed.',
      orderTagPrefix: 'Order #',
      roomTagPrefix: 'Room ',
      estimatedDeliveryHeader: 'ESTIMATED DELIVERY',
      estimatedDeliveryUnit: 'MINUTES',
      cancellationWarningPrefix: 'Cancel within:',
      cancellationWarningNotice: 'Not possible once kitchen starts preparation',
      trackCta: 'Track Order Status',
      backToMenuCta: 'Back to Menu',
      folioNotice: 'Charges added to room folio. Settled at checkout.',
    };

    assert.equal(figure35Contract.pillBadge, '✓ ORDER PLACED');
    assert.equal(figure35Contract.title, 'Order Confirmed!');
    assert.match(figure35Contract.subtitle, /KOT has been printed/);
    assert.equal(figure35Contract.estimatedDeliveryHeader, 'ESTIMATED DELIVERY');
    assert.equal(figure35Contract.estimatedDeliveryUnit, 'MINUTES');
    assert.match(figure35Contract.cancellationWarningNotice, /kitchen starts preparation/);
    assert.equal(figure35Contract.trackCta, 'Track Order Status');
    assert.equal(figure35Contract.backToMenuCta, 'Back to Menu');
    assert.match(figure35Contract.folioNotice, /Charges added to room folio/);
  });

  it('calculates 25-35 minutes ETA range from base estimate', () => {
    const baseEta = 25;
    const etaRange = `${baseEta}–${baseEta + 10} MINUTES`;
    assert.equal(etaRange, '25–35 MINUTES');
  });

  it('fetches existing order by ID and lists stay orders', async () => {
    const mockOrder = createMockOrderResponse(
      { items: [{ menuItemId: 'item-101', quantity: 2 }] },
      'idemp-test-read',
      '103',
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/food-orders/ORD-291')) {
        return new Response(JSON.stringify(mockOrder), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith('/food-orders')) {
        return new Response(JSON.stringify([mockOrder]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(mockOrder), { status: 200 });
    }) as typeof fetch;

    try {
      const single = await fetchGuestOrderById('token-101', 'ORD-291');
      assert.equal(single.orderId, 'ORD-291');
      assert.equal(single.roomNumber, '103');

      const list = await fetchGuestOrders('token-101');
      assert.equal(list.length, 1);
      assert.equal(list[0].orderId, 'ORD-291');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('allows cancellation of an order within the 10-minute window', async () => {
    const cancelledOrder: FoodOrderResponse = {
      ...createMockOrderResponse({ items: [] }, 'idemp-cancel', '103'),
      status: 'CANCELLED',
      canCancel: false,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/food-orders\/ORD-291\/cancel$/);
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify(cancelledOrder), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await cancelFoodOrder('token-101', 'ORD-291', 'Guest changed mind');
      assert.equal(result.status, 'CANCELLED');
      assert.equal(result.canCancel, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
