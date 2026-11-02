/**
 * Live HTTP & SSE Integration Test Suite against Local NestJS Backend (#101, Phase 5)
 *
 * Verifies that the frontend API-only client layer communicates directly with the
 * live NestJS backend endpoints on http://localhost:4300.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  redeemQrToken,
  fetchCurrentSession,
  fetchDemoTokens,
  logoutSession,
  resetBackendDemo,
  ApiError,
} from '../src/lib/api/guest-sessions.ts';
import {
  fetchGuestOrders,
  fetchGuestOrderById,
  placeFoodOrder,
  cancelFoodOrder,
  advanceDemoOrderStatus,
} from '../src/lib/api/orders.ts';
import { fetchGuestMenu } from '../src/lib/api/menu.ts';
import {
  createServiceRequest,
  fetchGuestServiceRequests,
  advanceDemoServiceRequestStatus,
} from '../src/lib/api/services.ts';
import {
  createComplaint,
  fetchGuestComplaints,
  advanceDemoComplaintStatus,
} from '../src/lib/api/complaints.ts';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4300';

const isExplicitLiveAllowed = process.env.ALLOW_LIVE_DATABASE_INTEGRATION_TESTS === 'true';
const isApprovedNeonTest =
  process.env.APPROVED_NEON_TEST_BRANCH === 'true' || process.env.ISOLATED_TEST_DB === 'true';

let preflightVerificationPromise: Promise<void> | null = null;

/**
 * Trustworthy preflight gate verifying that the remote backend connects to the
 * approved dedicated Neon test branch or local disposable test database.
 * Every write-capable test depends on this check before modifying state.
 */
async function ensureApprovedTestDatabaseVerified(): Promise<void> {
  if (!preflightVerificationPromise) {
    preflightVerificationPromise = (async () => {
      // 1. Public health liveness
      const healthRes = await fetch(`${BACKEND_URL}/health`);
      assert.equal(healthRes.status, 200);

      // 2. Public health readiness
      const readyRes = await fetch(`${BACKEND_URL}/health/ready`);
      assert.equal(readyRes.status, 200);

      // 3. Internal database isolation diagnostics
      const internalKey =
        process.env.INTERNAL_SERVICE_KEY || 'development-internal-service-key-at-least-32-chars';
      const diagRes = await fetch(`${BACKEND_URL}/health/internal/database-isolation`, {
        headers: {
          'x-internal-service-key': internalKey,
        },
      });

      if (diagRes.status === 401 || diagRes.status === 403) {
        throw new Error(
          `DATABASE SAFETY GATE BLOCKED: Failed to authenticate to internal database diagnostics at ${BACKEND_URL}/health/internal/database-isolation.`,
        );
      }

      const isolation = (await diagRes.json()) as {
        isDisposableTestDb: boolean;
        isCloudShared: boolean;
        classification: string;
        isApprovedTestBranch: boolean;
      };

      const isDedicatedNeonTest =
        isolation.classification === 'dedicated_neon_test' &&
        isolation.isApprovedTestBranch === true &&
        !isolation.isCloudShared;

      const isLocalDisposable =
        isolation.classification === 'disposable_local_test' &&
        isolation.isDisposableTestDb === true &&
        !isolation.isCloudShared;

      if (!isDedicatedNeonTest && !isLocalDisposable) {
        throw new Error(
          `DATABASE SAFETY GATE BLOCKED: The backend at ${BACKEND_URL} is NOT connected to an approved dedicated test database.\n` +
            `  Classification: ${isolation?.classification || 'unknown'}\n` +
            `  isApprovedTestBranch: ${isolation?.isApprovedTestBranch}\n` +
            `  isCloudShared: ${isolation?.isCloudShared}\n` +
            `Refusing to execute write-capable integration tests to protect shared and production databases.`,
        );
      }
    })();
  }
  return preflightVerificationPromise;
}

describe(
  'Phase 5 — Live NestJS Backend HTTP and SSE Integration Tests (#101)',
  { concurrency: 1 },
  () => {
    if (isExplicitLiveAllowed && !isApprovedNeonTest) {
      it('DATABASE SAFETY GATE: Refuses to run without test branch authorization', () => {
        throw new Error(
          'DATABASE SAFETY GATE BLOCKED: ALLOW_LIVE_DATABASE_INTEGRATION_TESTS=true was provided, but ' +
            'APPROVED_NEON_TEST_BRANCH=true is missing! Refusing to run write-capable integration tests without explicit test branch authorization.',
        );
      });
      return;
    }

    if (!isExplicitLiveAllowed || !isApprovedNeonTest) {
      it('DATABASE SAFETY GATE: Live backend integration tests disabled against unverified/shared database', (t) => {
        const warningMessage =
          'DATABASE SAFETY GATE ENFORCED: Write-capable live integration test execution is strictly disabled. ' +
          'The backend database connection is not verified as an approved dedicated test database. ' +
          'Running write tests against shared Neon development or production is prohibited to protect shared data. ' +
          'Prerequisites required: ALLOW_LIVE_DATABASE_INTEGRATION_TESTS=true AND APPROVED_NEON_TEST_BRANCH=true.';
        t.diagnostic(warningMessage);
        t.skip(warningMessage);
      });
      return;
    }

    let room101Token = '';
    let room102Token = '';
    let room103Token = '';
    let demoTokensMap: Record<string, string> = {};
    let createdOrderId = '';

    beforeEach(async () => {
      // Condition 6: Guarantees every test depends on preflight verification
      await ensureApprovedTestDatabaseVerified();
    });

    async function getOrInitTokens(): Promise<{
      token101: string;
      token102: string;
      token103: string;
    }> {
      await ensureApprovedTestDatabaseVerified();
      if (!demoTokensMap['101'] && !demoTokensMap['Room 101 (John Doe)']) {
        demoTokensMap = await fetchDemoTokens();
      }
      if (!room101Token) {
        const token101Qr = demoTokensMap['101'] || demoTokensMap['Room 101 (John Doe)'];
        const session101 = await redeemQrToken(token101Qr);
        room101Token = session101.sessionToken;
      }
      if (!room102Token) {
        const token102Qr = demoTokensMap['102'] || demoTokensMap['Room 102 (Jane Smith)'];
        const session102 = await redeemQrToken(token102Qr);
        room102Token = session102.sessionToken;
      }
      if (!room103Token) {
        const token103Qr = demoTokensMap['103'] || demoTokensMap['Room 103 (Robert Frost)'];
        const session103 = await redeemQrToken(token103Qr);
        room103Token = session103.sessionToken;
      }
      return { token101: room101Token, token102: room102Token, token103: room103Token };
    }

    it('1. Verifies NestJS backend health, database isolation target, and retrieves demo tokens', async () => {
      await ensureApprovedTestDatabaseVerified();

      demoTokensMap = await fetchDemoTokens();
      assert.ok(demoTokensMap);
      assert.ok(demoTokensMap['101'] || demoTokensMap['Room 101 (John Doe)']);
      assert.ok(demoTokensMap['102'] || demoTokensMap['Room 102 (Jane Smith)']);
      assert.ok(demoTokensMap['103'] || demoTokensMap['Room 103 (Robert Frost)']);
      assert.ok(demoTokensMap['999'] || demoTokensMap['Room 999 (Expired Session)']);
    });

    it('2. Authenticates Guest QR tokens via redeemQrToken() into genuine database sessions', async () => {
      const tokens = await getOrInitTokens();
      assert.ok(tokens.token101.length > 20);
      assert.ok(tokens.token102.length > 20);
      assert.ok(tokens.token103.length > 20);
    });

    it('3. Rejects expired stay scenarios with 401 Unauthorized via redeemQrToken()', async () => {
      await getOrInitTokens();
      const tokenExpiredQr = demoTokensMap['999'] || demoTokensMap['Room 999 (Expired Session)'];
      await assert.rejects(
        async () => redeemQrToken(tokenExpiredQr),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          assert.match(err.message, /expired/i);
          return true;
        },
      );
    });

    it('4. Enforces stay context isolation via fetchCurrentSession()', async () => {
      const tokens = await getOrInitTokens();
      const me101 = await fetchCurrentSession(tokens.token101);
      assert.equal(me101.roomNumber, '101');

      const me102 = await fetchCurrentSession(tokens.token102);
      assert.equal(me102.roomNumber, '102');
    });

    it('5. Retrieves canonical menu items and meal windows via fetchGuestMenu()', async () => {
      const tokens = await getOrInitTokens();
      const menu = await fetchGuestMenu(tokens.token101);
      assert.ok(Array.isArray(menu.items));
      assert.ok(menu.items.length > 0);
      assert.ok(Array.isArray(menu.mealWindows));
      assert.ok(menu.currentTimeInColombo);

      const firstItem = menu.items[0];
      assert.ok(firstItem.id);
      assert.ok(firstItem.name);
      assert.ok(typeof firstItem.price === 'number');
    });

    it('6. Places food order via placeFoodOrder() with idempotency key and allergyNote', async () => {
      const tokens = await getOrInitTokens();
      const idemKey = `idemp-live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const orderData = await placeFoodOrder(
        tokens.token101,
        {
          items: [
            {
              menuItemId: 'menu-item-001',
              quantity: 2,
              specialNotes: 'Extra sauce',
            },
          ],
          allergyNote: 'No sesame seeds',
          idempotencyKey: idemKey,
        },
        idemKey,
      );

      assert.ok(orderData.orderId);
      assert.equal(orderData.roomNumber, '101');
      assert.equal(orderData.status, 'PLACED');
      assert.equal(orderData.canCancel, true);
      createdOrderId = orderData.orderId;
    });

    it('7. Enforces Room & Booking Isolation: Room 102 cannot access Room 101 order', async () => {
      const tokens = await getOrInitTokens();
      assert.ok(createdOrderId);
      await assert.rejects(
        async () => fetchGuestOrderById(tokens.token102, createdOrderId),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('8. Retrieves guest order history via fetchGuestOrders() with verified room scope', async () => {
      const tokens = await getOrInitTokens();
      const orders101 = await fetchGuestOrders(tokens.token101);
      assert.ok(Array.isArray(orders101));
      assert.ok(orders101.some((o) => o.orderId === createdOrderId));
      assert.ok(orders101.every((o) => o.roomNumber === '101'));

      // Empty stay verification: Room 103 has 0 orders initially
      const orders103 = await fetchGuestOrders(tokens.token103);
      assert.deepEqual(orders103, []);
    });

    it('9. Advances order status through lifecycle via advanceDemoOrderStatus()', async () => {
      const tokens = await getOrInitTokens();
      assert.ok(createdOrderId);

      // 1. IN_PREPARATION
      const prepData = await advanceDemoOrderStatus(
        tokens.token101,
        createdOrderId,
        'IN_PREPARATION',
      );
      assert.equal(prepData.status, 'IN_PREPARATION');

      // 2. READY
      const readyData = await advanceDemoOrderStatus(tokens.token101, createdOrderId, 'READY');
      assert.equal(readyData.status, 'READY');

      // 3. DELIVERED
      const delData = await advanceDemoOrderStatus(tokens.token101, createdOrderId, 'DELIVERED');
      assert.equal(delData.status, 'DELIVERED');
      assert.equal(delData.canCancel, false);
    });

    it('10. Validates order cancellation and cutoff rules via cancelFoodOrder()', async () => {
      const tokens = await getOrInitTokens();

      // Place fresh cancellable order
      const idemKey = `idemp-cancel-${Date.now()}`;
      const newOrder = await placeFoodOrder(
        tokens.token101,
        {
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          idempotencyKey: idemKey,
        },
        idemKey,
      );
      assert.equal(newOrder.canCancel, true);

      // Cancel while in PLACED
      const cancelled = await cancelFoodOrder(tokens.token101, newOrder.orderId, 'Changed mind');
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.canCancel, false);

      // Attempting to cancel an already delivered order must fail with 409
      await assert.rejects(
        async () => cancelFoodOrder(tokens.token101, createdOrderId, 'Too late'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 409);
          return true;
        },
      );
    });

    it('11. Submits and advances service requests via createServiceRequest()', async () => {
      const tokens = await getOrInitTokens();
      const svcData = await createServiceRequest(
        tokens.token102,
        {
          requestType: 'EXTRA_TOWELS',
          priority: 'NORMAL',
          description: 'Two extra large bath towels please',
        },
        `idemp-svc-${Date.now()}`,
      );
      assert.equal(svcData.roomNumber, '102');
      assert.equal(svcData.status, 'SUBMITTED');

      // Advance to ASSIGNED
      const assignData = await advanceDemoServiceRequestStatus(
        tokens.token102,
        svcData.requestId,
        'ASSIGNED',
        'Kamal Perera',
      );
      assert.equal(assignData.status, 'ASSIGNED');
      assert.equal(assignData.assignedStaff, 'Kamal Perera');

      // Verify in history
      const requests102 = await fetchGuestServiceRequests(tokens.token102);
      assert.ok(requests102.some((r) => r.requestId === svcData.requestId));
    });

    it('12. Submits and updates complaints via createComplaint()', async () => {
      const tokens = await getOrInitTokens();
      const cmpData = await createComplaint(
        {
          category: 'CLEANLINESS',
          severity: 'MEDIUM',
          subject: 'Balcony door lock sticking',
          description: 'Difficult to lock balcony sliding door securely',
        },
        tokens.token101,
        `idemp-cmp-${Date.now()}`,
      );
      assert.equal(cmpData.roomNumber, '101');
      assert.equal(cmpData.status, 'SUBMITTED');

      // Advance status to UNDER_INVESTIGATION
      const updated = await advanceDemoComplaintStatus(
        tokens.token101,
        cmpData.complaintId,
        'UNDER_INVESTIGATION',
        'Maintenance technician dispatched to room',
      );
      assert.equal(updated.status, 'UNDER_INVESTIGATION');

      // Verify in history
      const complaints101 = await fetchGuestComplaints(tokens.token101);
      assert.ok(complaints101.some((c) => c.complaintId === cmpData.complaintId));
    });

    it('13. Verifies Realtime HTTP Polling and SSE stream establishment', async () => {
      const tokens = await getOrInitTokens();

      // 1. Polling fallback check
      const pollRes = await fetch(`${BACKEND_URL}/realtime/events/poll`, {
        headers: { Authorization: `Bearer ${tokens.token101}` },
      });
      assert.equal(pollRes.status, 200);
      const pollData = await pollRes.json();
      assert.ok(Array.isArray(pollData.events));
      assert.ok(typeof pollData.recommendedPollIntervalMs === 'number');
      assert.ok(pollData.serverTimestamp);

      // 2. Real SSE streaming connection check
      const abortCtrl = new AbortController();
      const sseRes = await fetch(`${BACKEND_URL}/realtime/events/stream?token=${tokens.token101}`, {
        headers: { Accept: 'text/event-stream' },
        signal: abortCtrl.signal,
      });
      assert.equal(sseRes.status, 200);
      assert.match(sseRes.headers.get('content-type') || '', /text\/event-stream/);
      abortCtrl.abort();
    });

    it('14. Handles 401, 403, and 404 error cases accurately', async () => {
      const tokens = await getOrInitTokens();

      // 401: Non-existent / bogus token
      await assert.rejects(
        async () => fetchGuestOrders('bogus-token-12345'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          return true;
        },
      );

      // 404: Non-existent order
      await assert.rejects(
        async () => fetchGuestOrderById(tokens.token101, 'ORD-NONEXISTENT-9999'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 404);
          return true;
        },
      );
    });

    it('15. Executes development demo-reset via resetBackendDemo()', async () => {
      await ensureApprovedTestDatabaseVerified();
      const resetResult = await resetBackendDemo();
      assert.equal(resetResult.success, true);
      assert.match(resetResult.message, /reset successfully/i);
    });

    it('16. Validates session logout and subsequent revocation via logoutSession()', async () => {
      const tokens = await getOrInitTokens();
      const logoutResult = await logoutSession(tokens.token101);
      assert.equal(logoutResult.success, true);

      // Attempting to use the logged out session token must return 401
      await assert.rejects(
        async () => fetchCurrentSession(tokens.token101),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });
  },
);
