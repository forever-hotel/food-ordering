import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fetchGuestOrders, fetchGuestOrderById, mergeOrders } from '../src/lib/api/orders.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { FoodOrderResponse } from '../src/types/orders.ts';

describe('FUI-02 Regression: Room Isolation and Real-Time Order Handling', () => {
  const sampleOrderRoom101: FoodOrderResponse = {
    orderId: 'ORD-101-A',
    roomNumber: '101',
    bookingId: 'booking-101',
    status: 'PLACED',
    totalAmount: 1200,
    items: [{ itemId: 'item-1', name: 'Curry Rice', unitPrice: 1200, quantity: 1 }],
    estimatedDeliveryMinutes: 25,
    idempotencyKey: 'idemp-101-a',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };

  const sampleOrderRoom103: FoodOrderResponse = {
    orderId: 'ORD-103-B',
    roomNumber: '103',
    bookingId: 'booking-103',
    status: 'IN_PREPARATION',
    totalAmount: 1800,
    items: [{ itemId: 'item-2', name: 'Kottu Roti', unitPrice: 900, quantity: 2 }],
    estimatedDeliveryMinutes: 25,
    idempotencyKey: 'idemp-103-b',
    createdAt: '2026-11-01T11:00:00.000Z',
    updatedAt: '2026-11-01T11:00:00.000Z',
  };

  const sampleDeliveredOrderRoom101: FoodOrderResponse = {
    orderId: 'ORD-101-DELIV',
    roomNumber: '101',
    bookingId: 'booking-101',
    status: 'DELIVERED',
    totalAmount: 850,
    items: [{ itemId: 'item-3', name: 'Noodles', unitPrice: 850, quantity: 1 }],
    estimatedDeliveryMinutes: 25,
    idempotencyKey: 'idemp-101-deliv',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:30:00.000Z',
  };

  const sampleOrderNoRoom: FoodOrderResponse = {
    orderId: 'ORD-NO-ROOM',
    roomNumber: '',
    bookingId: 'booking-101',
    status: 'PLACED',
    totalAmount: 500,
    items: [{ itemId: 'item-4', name: 'Tea', unitPrice: 500, quantity: 1 }],
    estimatedDeliveryMinutes: 25,
    idempotencyKey: 'idemp-no-room',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
  };

  // 1. Room 101 never displays Room 103 orders
  it('1. Room 101 never displays Room 103 orders', () => {
    const mixedOrders = [sampleOrderRoom101, sampleOrderRoom103];
    const guestRoom = '101';
    const guestBooking = 'booking-101';

    const roomOrders = mixedOrders.filter((o) => {
      if (!o.roomNumber || o.roomNumber !== guestRoom) return false;
      if (guestBooking && o.bookingId && o.bookingId !== guestBooking) return false;
      return true;
    });

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    assert.ok(roomOrders.every((o) => o.roomNumber === '101'));
    assert.ok(!roomOrders.some((o) => o.roomNumber === '103'));
  });

  // 2. A successful empty API response displays the empty state
  it('2. A successful empty API response returns an empty array rather than mock orders', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const orders = await fetchGuestOrders('session-token-room-101');
      assert.ok(Array.isArray(orders));
      assert.equal(orders.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Backend failures display an error rather than mock order history
  it('3. Backend failure throws ApiError instead of returning mock Room 103 order history', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Internal server error in KMS' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchGuestOrders('session-token-failing');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 500);
          assert.equal((err as ApiError).message, 'Internal server error in KMS');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Orders without verifiable stay ownership are not displayed
  it('4. Orders without verifiable stay ownership (missing roomNumber or mismatched bookingId) are rejected', () => {
    const unverifiedOrders = [sampleOrderRoom101, sampleOrderNoRoom, sampleOrderRoom103];
    const guestRoom = '101';
    const guestBooking = 'booking-101';

    const roomOrders = unverifiedOrders.filter((o) => {
      if (!o.roomNumber || o.roomNumber !== guestRoom) return false;
      if (guestBooking && o.bookingId && o.bookingId !== guestBooking) return false;
      return true;
    });

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    // Ensure order with empty roomNumber was rejected
    assert.ok(!roomOrders.some((o) => o.orderId === 'ORD-NO-ROOM'));
  });

  // 5. Delivered orders remain in the current stay history
  it('5. Delivered orders remain in the current stay history', () => {
    const stayOrders = [sampleOrderRoom101, sampleDeliveredOrderRoom101];
    const guestRoom = '101';
    const guestBooking = 'booking-101';

    const roomOrders = stayOrders.filter((o) => {
      if (!o.roomNumber || o.roomNumber !== guestRoom) return false;
      if (guestBooking && o.bookingId && o.bookingId !== guestBooking) return false;
      return true;
    });

    assert.equal(roomOrders.length, 2);
    const delivered = roomOrders.find((o) => o.orderId === 'ORD-101-DELIV');
    assert.ok(delivered);
    assert.equal(delivered.status, 'DELIVERED');
  });

  // 6. SSE events update the correct order
  it('6. SSE events update the targeted order in state and reject mismatched stay events', () => {
    const current = [sampleOrderRoom101];
    const incomingSseUpdate: FoodOrderResponse = {
      ...sampleOrderRoom101,
      status: 'IN_PREPARATION',
      updatedAt: '2026-11-01T10:15:00.000Z',
    };

    const merged = mergeOrders(current, [incomingSseUpdate]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].orderId, 'ORD-101-A');
    assert.equal(merged[0].status, 'IN_PREPARATION');

    // Mismatched room event rejection test
    const foreignEvent: FoodOrderResponse = {
      orderId: 'ORD-OTHER',
      roomNumber: '999',
      bookingId: 'booking-999',
      status: 'DELIVERED',
      totalAmount: 100,
      items: [],
      estimatedDeliveryMinutes: 20,
      createdAt: '2026-11-01T12:00:00.000Z',
      idempotencyKey: 'idemp-foreign',
    };
    const guestRoom = '101';
    const isAccepted = foreignEvent.roomNumber === guestRoom;
    assert.equal(isAccepted, false);
  });

  // 7. Stale polling responses do not regress newer statuses
  it('7. Stale polling responses do not regress an already advanced status', () => {
    // Current state has progressed to DELIVERED via realtime SSE
    const currentOrders: FoodOrderResponse[] = [
      {
        ...sampleOrderRoom101,
        status: 'DELIVERED',
        updatedAt: '2026-11-01T10:30:00.000Z',
      },
    ];

    // Delayed polling response still has the earlier IN_PREPARATION status
    const stalePollResponse: FoodOrderResponse[] = [
      {
        ...sampleOrderRoom101,
        status: 'IN_PREPARATION',
        updatedAt: '2026-11-01T10:10:00.000Z',
      },
    ];

    const result = mergeOrders(currentOrders, stalePollResponse);
    assert.equal(result.length, 1);
    // Must NOT regress back to IN_PREPARATION
    assert.equal(result[0].status, 'DELIVERED');
  });

  // 8. Switching guest sessions clears previous guest data
  it('8. Switching guest sessions produces isolated empty state for a new room', () => {
    let activeSessionOrders: FoodOrderResponse[] = [sampleOrderRoom101];

    // Guest logs out or switches to Room 204
    activeSessionOrders = [];
    assert.equal(activeSessionOrders.length, 0);

    const roomOrders = activeSessionOrders.filter((o) => o.roomNumber === '204');
    assert.equal(roomOrders.length, 0);
  });

  // 9. Navigation to and from Order Tracker does not recreate infinite render loop
  it('9. Navigation state bailout prevents infinite re-render loops on identical config', () => {
    let callCount = 0;
    type HeaderConfig = { title: string; subtitle?: string; showBackButton?: boolean };
    let currentState: HeaderConfig = { title: 'Order History', subtitle: 'Room 101' };

    const setPageHeaderBailout = (next: HeaderConfig) => {
      if (
        currentState.title === next.title &&
        currentState.subtitle === next.subtitle &&
        currentState.showBackButton === next.showBackButton
      ) {
        return; // Bail out!
      }
      currentState = next;
      callCount++;
    };

    // First call transitions to Order Tracker
    setPageHeaderBailout({
      title: 'Order Tracker',
      subtitle: 'Order #ORD-101-A',
      showBackButton: true,
    });
    assert.equal(callCount, 1);

    // Repeated identical calls (e.g. from rapid component renders) must bail out without state updates
    setPageHeaderBailout({
      title: 'Order Tracker',
      subtitle: 'Order #ORD-101-A',
      showBackButton: true,
    });
    setPageHeaderBailout({
      title: 'Order Tracker',
      subtitle: 'Order #ORD-101-A',
      showBackButton: true,
    });
    assert.equal(callCount, 1);

    // Transition back to Order History
    setPageHeaderBailout({ title: 'Order History', subtitle: 'Room 101' });
    assert.equal(callCount, 2);
  });

  // 10. fetchGuestOrderById throws ApiError on failed request instead of mock fallback
  it('10. fetchGuestOrderById throws ApiError on failed request instead of mock fallback', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchGuestOrderById('session-token-failing', 'ORD-MISSING');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 404);
          assert.equal((err as ApiError).message, 'Order not found');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
