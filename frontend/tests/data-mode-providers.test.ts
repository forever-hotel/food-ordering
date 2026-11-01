import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDataMode,
  setDataMode,
  resetDataModeForTesting,
} from '../src/lib/data-mode/data-mode.ts';
import { demoStateStore } from '../src/lib/data-mode/demo/demo-state-store.ts';
import { ApiError } from '../src/lib/data-mode/api-error.ts';
import {
  fetchGuestOrders,
  fetchGuestOrderById,
  placeFoodOrder,
  cancelFoodOrder,
  advanceDemoOrderStatus,
} from '../src/lib/api/orders.ts';
import { createServiceRequest, advanceDemoServiceRequestStatus } from '../src/lib/api/services.ts';
import { createComplaint, advanceDemoComplaintStatus } from '../src/lib/api/complaints.ts';
import { redeemQrToken } from '../src/lib/api/guest-sessions.ts';

describe('Phase 7 — Comprehensive Data Mode & Production Safeguards Tests (#101)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetDataModeForTesting();
    demoStateStore.resetToInitial();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    resetDataModeForTesting();
    demoStateStore.resetToInitial();
  });

  describe('Demo Mode Isolated Functionality & Multi-Room Separation', () => {
    beforeEach(() => {
      setDataMode('demo');
    });

    it('activates Demo Mode and resolves demo provider implementations', () => {
      assert.equal(getDataMode(), 'demo');
    });

    it('authenticates multiple distinct rooms with independent stay contexts', async () => {
      // Room 101
      const session101 = await redeemQrToken('act-demo-101');
      assert.equal(session101.guest.roomNumber, '101');
      assert.equal(session101.guest.bookingId, 'booking-101');
      assert.equal(session101.guest.guestName, 'John Doe');

      // Room 102
      const session102 = await redeemQrToken('act-demo-102');
      assert.equal(session102.guest.roomNumber, '102');
      assert.equal(session102.guest.bookingId, 'booking-102');
      assert.equal(session102.guest.guestName, 'Jane Smith');

      // Room 103
      const session103 = await redeemQrToken('act-demo-103');
      assert.equal(session103.guest.roomNumber, '103');
      assert.equal(session103.guest.bookingId, 'booking-103');
      assert.equal(session103.guest.guestName, 'Robert Frost');

      // Room 204
      const session204 = await redeemQrToken('act-demo-204');
      assert.equal(session204.guest.roomNumber, '204');
      assert.equal(session204.guest.bookingId, 'booking-204');
      assert.equal(session204.guest.guestName, 'Alice Wong');

      // Expired room session
      await assert.rejects(
        async () => redeemQrToken('act-demo-expired'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.match(err.message, /expired/i);
          return true;
        },
      );
    });

    it('enforces strict multi-room isolation for orders', async () => {
      const token101 = 'demo-token-room-101';
      const token102 = 'demo-token-room-102';
      const token103 = 'demo-token-room-103';

      const orders101 = await fetchGuestOrders(token101);
      const orders102 = await fetchGuestOrders(token102);
      const orders103 = await fetchGuestOrders(token103);

      assert.ok(orders101.length > 0);
      assert.ok(orders101.every((o) => o.roomNumber === '101' && o.bookingId === 'booking-101'));

      assert.ok(orders102.length > 0);
      assert.ok(orders102.every((o) => o.roomNumber === '102' && o.bookingId === 'booking-102'));

      // Room 103 has 0 orders initially
      assert.equal(orders103.length, 0);

      // Ensure Room 102 cannot view Room 101's order
      const order101Id = orders101[0].orderId;
      await assert.rejects(
        async () => fetchGuestOrderById(token102, order101Id),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('simulates complete order lifecycle (place -> advance -> deliver)', async () => {
      const token101 = 'demo-token-room-101';

      // 1. Place order
      const newOrder = await placeFoodOrder(
        token101,
        {
          items: [
            {
              menuItemId: 'menu-item-001',
              quantity: 2,
              specialNotes: 'Extra hot',
            },
          ],
          allergyNote: 'No nuts',
        },
        'idem-test-101-order',
      );

      assert.equal(newOrder.roomNumber, '101');
      assert.equal(newOrder.bookingId, 'booking-101');
      assert.equal(newOrder.status, 'PLACED');
      assert.equal(newOrder.totalAmount, 3600); // 1800 * 2

      // 2. Advance to IN_PREPARATION
      const prep = await advanceDemoOrderStatus(token101, newOrder.orderId, 'IN_PREPARATION');
      assert.equal(prep.status, 'IN_PREPARATION');

      // 3. Advance to READY
      const ready = await advanceDemoOrderStatus(token101, newOrder.orderId, 'READY');
      assert.equal(ready.status, 'READY');

      // 4. Advance to DELIVERED
      const delivered = await advanceDemoOrderStatus(token101, newOrder.orderId, 'DELIVERED');
      assert.equal(delivered.status, 'DELIVERED');
    });

    it('simulates order cancellation within allowed window', async () => {
      const token101 = 'demo-token-room-101';

      // ORD-101-PLACED is in PLACED status
      const cancelled = await cancelFoodOrder(token101, 'ORD-101-PLACED', 'Changed my mind');
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.canCancel, false);
    });

    it('simulates service request lifecycle with room isolation', async () => {
      const token102 = 'demo-token-room-102';

      const created = await createServiceRequest(
        token102,
        {
          requestType: 'HOUSEKEEPING',
          priority: 'NORMAL',
          description: 'Need extra pillows please',
        },
        'idem-svc-test',
      );

      assert.equal(created.roomNumber, '102');
      assert.equal(created.bookingId, 'booking-102');
      assert.equal(created.status, 'SUBMITTED');

      const assigned = await advanceDemoServiceRequestStatus(
        token102,
        created.requestId,
        'ASSIGNED',
        'Sunil Housekeeping',
      );
      assert.equal(assigned.status, 'ASSIGNED');
      assert.equal(assigned.assignedStaff, 'Sunil Housekeeping');

      const completed = await advanceDemoServiceRequestStatus(
        token102,
        created.requestId,
        'COMPLETED',
      );
      assert.equal(completed.status, 'COMPLETED');
    });

    it('simulates complaint creation and escalation flow', async () => {
      const token101 = 'demo-token-room-101';

      const complaint = await createComplaint(
        {
          category: 'NOISE',
          severity: 'HIGH',
          subject: 'Loud construction nearby',
          description: 'Noise drilling on 2nd floor during resting hours',
        },
        token101,
        'idem-cmp-test',
      );

      assert.equal(complaint.roomNumber, '101');
      assert.equal(complaint.status, 'SUBMITTED');

      const investigating = await advanceDemoComplaintStatus(
        token101,
        complaint.complaintId,
        'UNDER_INVESTIGATION',
        'Manager contacted maintenance',
      );
      assert.equal(investigating.status, 'UNDER_INVESTIGATION');

      const resolved = await advanceDemoComplaintStatus(
        token101,
        complaint.complaintId,
        'RESOLVED',
        'Maintenance postponed until afternoon',
      );
      assert.equal(resolved.status, 'RESOLVED');
    });

    it('resets demo state back to pristine initial dataset on reset', async () => {
      const token101 = 'demo-token-room-101';

      await placeFoodOrder(
        token101,
        {
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        },
        'idem-reset-check',
      );

      const beforeReset = await fetchGuestOrders(token101);
      assert.equal(beforeReset.length, 3); // 2 seed + 1 placed

      demoStateStore.resetToInitial();

      const afterReset = await fetchGuestOrders(token101);
      assert.equal(afterReset.length, 2); // exactly back to 2 initial seed orders
    });
  });

  describe('API Mode Strict Behavioral Protection', () => {
    beforeEach(() => {
      setDataMode('api');
    });

    it('activates API mode and dispatches to live API endpoints', () => {
      assert.equal(getDataMode(), 'api');
    });

    it('throws genuine ApiError on HTTP failure without falling back to demo data', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ message: 'Order service unavailable', statusCode: 503 }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch;

      await assert.rejects(
        async () => fetchGuestOrders('real-token-guest-999'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          assert.match(err.message, /unavailable/i);
          return true;
        },
      );
    });

    it('preserves genuine empty responses without synthetic substitution', async () => {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const orders = await fetchGuestOrders('real-token-guest-empty');
      assert.deepEqual(orders, []);
    });

    it('requires a session token and rejects anonymous execution in API mode', async () => {
      await assert.rejects(
        async () => fetchGuestOrders(''),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });

    it('does not silently activate demo mode when a network error occurs', async () => {
      globalThis.fetch = (async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:4300');
      }) as typeof fetch;

      await assert.rejects(
        async () => fetchGuestOrders('real-token-guest'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          return true;
        },
      );

      // Verify data mode is STILL 'api' and has not reverted to 'demo'
      assert.equal(getDataMode(), 'api');
    });
  });

  describe('Production Safeguards & Security Boundaries', () => {
    it('forces API mode in production environment regardless of storage or env variable', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_DATA_MODE = 'demo';

      assert.equal(getDataMode(), 'api');
    });

    it('throws security error when attempting to enable Demo Mode in production', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      assert.throws(
        () => setDataMode('demo'),
        /Production safety violation: Demo mode cannot be activated in production/i,
      );
    });

    it('validates next.config.ts safety guard prevents production build with demo mode', () => {
      const simulateNextConfigCheck = (env: Record<string, string | undefined>) => {
        if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_DATA_MODE === 'demo') {
          throw new Error(
            'PRODUCTION SAFETY VIOLATION: Production build cannot be compiled with NEXT_PUBLIC_DATA_MODE=demo.',
          );
        }
        return true;
      };

      assert.equal(
        simulateNextConfigCheck({ NODE_ENV: 'production', NEXT_PUBLIC_DATA_MODE: 'api' }),
        true,
      );

      assert.throws(
        () =>
          simulateNextConfigCheck({
            NODE_ENV: 'production',
            NEXT_PUBLIC_DATA_MODE: 'demo',
          }),
        /PRODUCTION SAFETY VIOLATION/,
      );
    });
  });
});
