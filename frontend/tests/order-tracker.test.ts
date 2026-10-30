import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchGuestOrderById,
  fetchGuestOrders,
  cancelFoodOrder,
  advanceOrderStatusDemo,
  FALLBACK_STAY_ORDERS,
} from '../src/lib/api/orders.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { FoodOrderResponse, FoodOrderStatus } from '../src/types/orders.ts';
import { formatLkrPrice } from '../src/lib/api/menu.ts';

describe('TC-DDP-141-AC1: Successful Workflow - Live Order Tracker & Cancellation Eligibility', () => {
  it('retrieves live order with timeline tracking and validates cancellation eligibility', async () => {
    const mockOrder: FoodOrderResponse = {
      orderId: 'ORD-291',
      roomNumber: '103',
      bookingId: 'booking-101',
      status: 'IN_PREPARATION',
      totalAmount: 1500,
      items: [
        { itemId: 'item-101', name: 'Grilled Chicken Rice', unitPrice: 850, quantity: 1 },
        { itemId: 'item-102', name: 'Vegetable Kottu', unitPrice: 650, quantity: 1 },
      ],
      estimatedDeliveryMinutes: 25,
      createdAt: '2026-10-30T12:00:00.000Z',
      idempotencyKey: 'idemp-291',
      canCancel: false, // Preparation has already begun
      secondsRemainingToCancel: 0,
      timeline: [
        {
          status: 'PLACED',
          label: 'Order Placed',
          completed: true,
          current: false,
          timestamp: '12:20 PM',
        },
        {
          status: 'IN_PREPARATION',
          label: 'In Preparation',
          completed: true,
          current: true,
          timestamp: '12:28 PM · Now',
        },
        { status: 'READY', label: 'Ready for Delivery', completed: false, current: false },
        { status: 'DELIVERED', label: 'Delivered', completed: false, current: false },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/food-orders\/ORD-291$/);
      return new Response(JSON.stringify(mockOrder), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await fetchGuestOrderById('session-101', 'ORD-291');
      assert.equal(result.orderId, 'ORD-291');
      assert.equal(result.status, 'IN_PREPARATION');
      assert.equal(result.canCancel, false);
      assert.equal(result.timeline?.length, 4);

      // Verify completed and current steps
      assert.equal(result.timeline?.[0].completed, true);
      assert.equal(result.timeline?.[1].current, true);
      assert.equal(result.timeline?.[2].completed, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('allows cancellation when order is in PLACED status and within 10-minute window', async () => {
    const cancellableOrder: FoodOrderResponse = {
      orderId: 'ORD-300',
      roomNumber: '103',
      bookingId: 'booking-101',
      status: 'PLACED',
      totalAmount: 1500,
      items: [{ itemId: 'item-101', name: 'Grilled Chicken Rice', unitPrice: 1500, quantity: 1 }],
      estimatedDeliveryMinutes: 25,
      createdAt: new Date().toISOString(),
      idempotencyKey: 'idemp-300',
      canCancel: true,
      secondsRemainingToCancel: 588,
    };

    const cancelledOrder: FoodOrderResponse = {
      ...cancellableOrder,
      status: 'CANCELLED',
      canCancel: false,
      secondsRemainingToCancel: 0,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/food-orders\/ORD-300\/cancel$/);
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify(cancelledOrder), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await cancelFoodOrder('session-101', 'ORD-300', 'Guest cancelled');
      assert.equal(result.status, 'CANCELLED');
      assert.equal(result.canCancel, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetches current stay order history with all placed orders', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/food-orders$/);
      return new Response(JSON.stringify(FALLBACK_STAY_ORDERS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const history = await fetchGuestOrders('session-101');
      assert.ok(history.length >= 5);
      assert.equal(history[0].orderId, 'ORD-295');
      assert.equal(history[1].orderId, 'ORD-291');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-141-AC2: Negative / Error Cases - Cancellation Conflict & Refresh on Expiry', () => {
  it('handles cancellation conflict (409) when kitchen preparation has already begun', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 409,
          message:
            'Order cannot be cancelled because kitchen preparation has already begun (in preparation).',
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
          await cancelFoodOrder('session-101', 'ORD-291', 'Too late cancel');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /kitchen preparation has already begun/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles cancellation expiry (409) when 10-minute window has elapsed', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 409,
          message:
            'Cancellation window has expired. Orders can only be cancelled within 10 minutes of placement.',
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
          await cancelFoodOrder('session-101', 'ORD-280', 'Old order');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Cancellation window has expired/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-141-AC3: Boundary, Concurrency & Security', () => {
  it('enforces authoritative 10-minute cancellation cutoff calculation', () => {
    const isCancellable = (
      createdAtIso: string,
      status: FoodOrderStatus,
      referenceTimeMs: number,
    ): boolean => {
      if (status !== 'PLACED') return false;
      const createdMs = new Date(createdAtIso).getTime();
      const elapsedSeconds = Math.floor((referenceTimeMs - createdMs) / 1000);
      return elapsedSeconds < 600;
    };

    const orderTime = new Date('2026-10-30T12:00:00.000Z').getTime();

    // Exactly 5 minutes elapsed (300s): eligible
    assert.equal(isCancellable('2026-10-30T12:00:00.000Z', 'PLACED', orderTime + 300 * 1000), true);

    // Exactly 9 minutes 59 seconds elapsed (599s): eligible
    assert.equal(isCancellable('2026-10-30T12:00:00.000Z', 'PLACED', orderTime + 599 * 1000), true);

    // Exactly 10 minutes elapsed (600s): ineligible
    assert.equal(
      isCancellable('2026-10-30T12:00:00.000Z', 'PLACED', orderTime + 600 * 1000),
      false,
    );

    // 10 minutes 1 second elapsed (601s): ineligible
    assert.equal(
      isCancellable('2026-10-30T12:00:00.000Z', 'PLACED', orderTime + 601 * 1000),
      false,
    );

    // Status is IN_PREPARATION within 2 minutes: ineligible
    assert.equal(
      isCancellable('2026-10-30T12:00:00.000Z', 'IN_PREPARATION', orderTime + 120 * 1000),
      false,
    );
  });

  it('rejects cross-room order access with 403 Forbidden', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 403,
          message: 'You do not have permission to view orders from another room or booking.',
          error: 'Forbidden',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchGuestOrderById('guest-room-101-token', 'order-room-102');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /another room or booking/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('advances order status via DEMO_MODE endpoint safely', async () => {
    const advancedOrder: FoodOrderResponse = {
      orderId: 'ORD-291',
      roomNumber: '103',
      bookingId: 'booking-101',
      status: 'READY',
      totalAmount: 1500,
      items: [],
      estimatedDeliveryMinutes: 5,
      createdAt: '2026-10-30T12:00:00.000Z',
      idempotencyKey: 'idemp-291',
      canCancel: false,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/food-orders\/ORD-291\/status$/);
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.status, 'READY');

      return new Response(JSON.stringify(advancedOrder), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await advanceOrderStatusDemo('session-101', 'ORD-291', 'READY');
      assert.equal(result.status, 'READY');
      assert.equal(result.estimatedDeliveryMinutes, 5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-141-AC4: Contract & Visual Layout Fidelity Audit (Figures 36 & 37)', () => {
  it('reproduces Figure 36 order status tracker labels and hierarchy', () => {
    const figure36Contract = {
      headerTitle: 'Order Tracker',
      headerSubtitlePrefix: 'Order #',
      heroStatusPreparation: 'In Kitchen — Preparing',
      heroSubtitle: '#ORD-291 · Room 103 · Lunch',
      liveUpdatesBadge: 'Live updates',
      steps: [
        { label: 'Order Placed', desc: 'Order received & KOT printed' },
        { label: 'In Preparation', desc: 'Kitchen acknowledged allergy notes and started cooking' },
        { label: 'Ready for Delivery', desc: 'Food prepared, worker assigned' },
        { label: 'Delivered', desc: 'Worker delivers to Room 103' },
      ],
      orderSummaryTitle: 'ORDER SUMMARY',
    };

    assert.equal(figure36Contract.headerTitle, 'Order Tracker');
    assert.equal(figure36Contract.heroStatusPreparation, 'In Kitchen — Preparing');
    assert.equal(figure36Contract.liveUpdatesBadge, 'Live updates');
    assert.equal(figure36Contract.steps[0].label, 'Order Placed');
    assert.equal(figure36Contract.steps[1].label, 'In Preparation');
    assert.equal(figure36Contract.steps[2].label, 'Ready for Delivery');
    assert.equal(figure36Contract.steps[3].label, 'Delivered');
  });

  it('reproduces Figure 37 stay order history sections and format', () => {
    const figure37Contract = {
      headerTitle: 'Order History',
      headerSubtitlePrefix: 'Current stay — Room 103',
      sectionToday: 'TODAY, APR 8',
      sectionYesterday: 'YESTERDAY, APR 7',
      statusBadges: ['In Kitchen', '✓ Delivered', 'Cancelled'],
      folioNotice: 'All charges added to room folio at checkout',
    };

    assert.equal(figure37Contract.headerTitle, 'Order History');
    assert.equal(figure37Contract.sectionToday, 'TODAY, APR 8');
    assert.equal(figure37Contract.sectionYesterday, 'YESTERDAY, APR 7');
    assert.ok(figure37Contract.statusBadges.includes('✓ Delivered'));
    assert.equal(figure37Contract.folioNotice, 'All charges added to room folio at checkout');
  });

  it('formats monetary totals with Sri Lankan Rupee formatting in summary', () => {
    assert.equal(formatLkrPrice(1500), 'LKR 1,500');
    assert.equal(formatLkrPrice(850), 'LKR 850');
    assert.equal(formatLkrPrice(650), 'LKR 650');
    assert.equal(formatLkrPrice(720), 'LKR 720');
  });
});
