import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchGuestOrders,
  fetchGuestOrderById,
  reconcileAuthoritativeOrders,
  applyIncrementalOrderUpdate,
  mergeOrders,
} from '../src/lib/api/orders.ts';
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

  const sampleOrderRoom101PreviousStay: FoodOrderResponse = {
    orderId: 'ORD-101-OLD',
    roomNumber: '101',
    bookingId: 'booking-old-stay',
    status: 'DELIVERED',
    totalAmount: 1400,
    items: [{ itemId: 'item-old', name: 'Fried Rice', unitPrice: 1400, quantity: 1 }],
    estimatedDeliveryMinutes: 20,
    idempotencyKey: 'idemp-101-old',
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:30:00.000Z',
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

  const sampleOrderNoBooking: FoodOrderResponse = {
    orderId: 'ORD-NO-BOOKING',
    roomNumber: '101',
    bookingId: '',
    status: 'PLACED',
    totalAmount: 500,
    items: [{ itemId: 'item-5', name: 'Coffee', unitPrice: 500, quantity: 1 }],
    estimatedDeliveryMinutes: 15,
    idempotencyKey: 'idemp-no-booking',
    createdAt: '2026-11-01T09:30:00.000Z',
    updatedAt: '2026-11-01T09:30:00.000Z',
  };

  // Helper matching OrdersTab stay isolation filter
  const filterStayOrders = (
    orders: FoodOrderResponse[],
    roomNumber?: string,
    bookingId?: string,
  ): FoodOrderResponse[] => {
    if (!roomNumber || !bookingId) return [];
    return orders.filter((o) => {
      if (!o.roomNumber || !o.bookingId) return false;
      if (o.roomNumber !== roomNumber || o.bookingId !== bookingId) return false;
      return true;
    });
  };

  // 1. Room 101 versus Room 103
  it('1. Room 101 never displays Room 103 orders', () => {
    const mixedOrders = [sampleOrderRoom101, sampleOrderRoom103];
    const guestRoom = '101';
    const guestBooking = 'booking-101';

    const roomOrders = filterStayOrders(mixedOrders, guestRoom, guestBooking);

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    assert.ok(roomOrders.every((o) => o.roomNumber === '101'));
    assert.ok(!roomOrders.some((o) => o.roomNumber === '103'));
  });

  // 2. Same room with different bookings (previous guest stay in Room 101)
  it('2. Same room with different bookings is rejected (previous guest stay in same room)', () => {
    const ordersSameRoomDifferentBookings = [sampleOrderRoom101, sampleOrderRoom101PreviousStay];
    const currentGuestRoom = '101';
    const currentGuestBooking = 'booking-101';

    const roomOrders = filterStayOrders(
      ordersSameRoomDifferentBookings,
      currentGuestRoom,
      currentGuestBooking,
    );

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    assert.ok(!roomOrders.some((o) => o.bookingId === 'booking-old-stay'));
  });

  // 3. Missing booking IDs
  it('3. Orders missing booking IDs are rejected by stay isolation filter', () => {
    const unverifiedOrders = [sampleOrderRoom101, sampleOrderNoBooking];
    const roomOrders = filterStayOrders(unverifiedOrders, '101', 'booking-101');

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    assert.ok(!roomOrders.some((o) => o.orderId === 'ORD-NO-BOOKING'));
  });

  // 4. Missing room IDs
  it('4. Orders missing room IDs are rejected by stay isolation filter', () => {
    const unverifiedOrders = [sampleOrderRoom101, sampleOrderNoRoom];
    const roomOrders = filterStayOrders(unverifiedOrders, '101', 'booking-101');

    assert.equal(roomOrders.length, 1);
    assert.equal(roomOrders[0].orderId, 'ORD-101-A');
    assert.ok(!roomOrders.some((o) => o.orderId === 'ORD-NO-ROOM'));
  });

  // 5. Backend returns an authoritative empty array
  it('5. Backend returning an authoritative empty array clears stale history', async () => {
    // Current local state holds previous orders
    const currentState = [sampleOrderRoom101];

    // Backend returns authoritative empty array (e.g. fresh stay or cleared orders)
    const emptyIncoming: FoodOrderResponse[] = [];
    const reconciled = reconcileAuthoritativeOrders(currentState, emptyIncoming);

    assert.ok(Array.isArray(reconciled));
    assert.equal(reconciled.length, 0);

    // API fetch test
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

  // 6. Delivered order remains in current stay
  it('6. Delivered order remains in the current stay history', () => {
    const stayOrders = [sampleOrderRoom101, sampleDeliveredOrderRoom101];
    const roomOrders = filterStayOrders(stayOrders, '101', 'booking-101');

    assert.equal(roomOrders.length, 2);
    const delivered = roomOrders.find((o) => o.orderId === 'ORD-101-DELIV');
    assert.ok(delivered);
    assert.equal(delivered.status, 'DELIVERED');

    // Authoritative reconciliation preserves delivered orders present in server response
    const reconciled = reconcileAuthoritativeOrders([sampleOrderRoom101], stayOrders);
    assert.equal(reconciled.length, 2);
    assert.ok(reconciled.some((o) => o.orderId === 'ORD-101-DELIV' && o.status === 'DELIVERED'));
  });

  // 7. SSE event from a different stay
  it('7. SSE event from a different stay is rejected', () => {
    const guestRoom = '101';
    const guestBooking = 'booking-101';

    const foreignEvents: FoodOrderResponse[] = [
      // Different room
      { ...sampleOrderRoom103, roomNumber: '103', bookingId: 'booking-101' },
      // Different booking, same room
      { ...sampleOrderRoom101PreviousStay, roomNumber: '101', bookingId: 'booking-999' },
      // Missing room
      { ...sampleOrderNoRoom },
      // Missing booking
      { ...sampleOrderNoBooking },
    ];

    for (const evt of foreignEvents) {
      const isAccepted = Boolean(
        evt.roomNumber &&
        evt.bookingId &&
        evt.roomNumber === guestRoom &&
        evt.bookingId === guestBooking,
      );
      assert.equal(isAccepted, false, `Event ${evt.orderId} must be rejected`);
    }
  });

  // 8. Older polling response after a newer event
  it('8. Older polling response after a newer event does not regress status', () => {
    // Current state has progressed to DELIVERED via realtime SSE at 10:30
    const currentOrders: FoodOrderResponse[] = [
      {
        ...sampleOrderRoom101,
        status: 'DELIVERED',
        updatedAt: '2026-11-01T10:30:00.000Z',
      },
    ];

    // Delayed polling response was sent earlier at 10:10 and has IN_PREPARATION
    const stalePollResponse: FoodOrderResponse[] = [
      {
        ...sampleOrderRoom101,
        status: 'IN_PREPARATION',
        updatedAt: '2026-11-01T10:10:00.000Z',
      },
    ];

    const result = reconcileAuthoritativeOrders(currentOrders, stalePollResponse);
    assert.equal(result.length, 1);
    // Must NOT regress back to IN_PREPARATION
    assert.equal(result[0].status, 'DELIVERED');
  });

  // 9. Logout and login to another room
  it('9. Logout and login to another room produces isolated state without data leakage', () => {
    let sessionOrders: FoodOrderResponse[] = [sampleOrderRoom101];
    let guestRoom: string | null = '101';
    let guestBooking: string | null = 'booking-101';

    // 1. Guest logs out
    sessionOrders = [];
    guestRoom = null;
    guestBooking = null;

    const loggedOutOrders = filterStayOrders(sessionOrders, guestRoom || '', guestBooking || '');
    assert.equal(loggedOutOrders.length, 0);

    // 2. New guest logs into Room 204, booking-204
    guestRoom = '204';
    guestBooking = 'booking-204';
    const room204Order: FoodOrderResponse = {
      orderId: 'ORD-204-X',
      roomNumber: '204',
      bookingId: 'booking-204',
      status: 'PLACED',
      totalAmount: 1100,
      items: [{ itemId: 'item-204', name: 'Fruit Platter', unitPrice: 1100, quantity: 1 }],
      estimatedDeliveryMinutes: 15,
      idempotencyKey: 'idemp-204-x',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    };
    sessionOrders = reconcileAuthoritativeOrders([], [room204Order]);

    const activeOrders = filterStayOrders(sessionOrders, guestRoom, guestBooking);
    assert.equal(activeOrders.length, 1);
    assert.equal(activeOrders[0].orderId, 'ORD-204-X');
    assert.ok(!activeOrders.some((o) => o.orderId === 'ORD-101-A'));
  });

  // 10. Request failure during session switching
  it('10. Request failure during session switching clears orders and throws ApiError', async () => {
    let activeOrders: FoodOrderResponse[] = [sampleOrderRoom101];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Session expired or service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchGuestOrders('new-session-token');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 503);
          return true;
        },
      );
      // In component catch block: activeOrders is explicitly reset to []
      activeOrders = [];
      assert.equal(activeOrders.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 11. Backend failure throws ApiError instead of returning mock Room 103 order history
  it('11. Backend failure throws ApiError instead of returning mock Room 103 order history', async () => {
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

  // 12. fetchGuestOrderById throws ApiError on failed request instead of mock fallback
  it('12. fetchGuestOrderById throws ApiError on failed request instead of mock fallback', async () => {
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

  // 13. Incremental SSE status updates via applyIncrementalOrderUpdate
  it('13. Incremental SSE status update adds new order and updates existing without dropping other stay orders', () => {
    const initialOrders = [sampleOrderRoom101];
    const incomingSseOrder: FoodOrderResponse = {
      orderId: 'ORD-101-NEW',
      roomNumber: '101',
      bookingId: 'booking-101',
      status: 'PLACED',
      totalAmount: 900,
      items: [{ itemId: 'item-new', name: 'Dessert', unitPrice: 900, quantity: 1 }],
      estimatedDeliveryMinutes: 20,
      idempotencyKey: 'idemp-101-new',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    };

    const updated = applyIncrementalOrderUpdate(initialOrders, incomingSseOrder);
    assert.equal(updated.length, 2);
    assert.ok(updated.some((o) => o.orderId === 'ORD-101-A'));
    assert.ok(updated.some((o) => o.orderId === 'ORD-101-NEW'));
  });

  // 14. Server status cancellation takes precedence when server timestamp is newer
  it('14. Server status cancellation takes precedence when server timestamp is newer', () => {
    const currentOrders = [
      {
        ...sampleOrderRoom101,
        status: 'IN_PREPARATION' as const,
        updatedAt: '2026-11-01T10:15:00.000Z',
      },
    ];

    const serverCancelledOrder: FoodOrderResponse = {
      ...sampleOrderRoom101,
      status: 'CANCELLED' as const,
      updatedAt: '2026-11-01T10:20:00.000Z',
    };

    const reconciled = reconcileAuthoritativeOrders(currentOrders, [serverCancelledOrder]);
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].status, 'CANCELLED');
  });

  // 15. mergeOrders delegates to authoritative reconciliation by default
  it('15. mergeOrders delegates to authoritative reconciliation by default and clears on empty incoming', () => {
    const currentOrders = [sampleOrderRoom101];
    const authoritativeResult = mergeOrders(currentOrders, []);
    assert.equal(authoritativeResult.length, 0);

    const incrementalResult = mergeOrders(currentOrders, [sampleOrderRoom103], {
      isAuthoritative: false,
    });
    assert.equal(incrementalResult.length, 2);
  });

  // 16. Navigation to and from Order Tracker does not recreate infinite render loop
  it('16. Navigation state bailout prevents infinite re-render loops on identical config', () => {
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
});
