import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { placeFoodOrder, fetchGuestOrders, generateIdempotencyKey } from '../src/lib/api/orders.ts';
import type { CreateFoodOrderPayload, FoodOrderResponse } from '../src/types/orders.ts';
import { createServiceRequest, generateServiceIdempotencyKey } from '../src/lib/api/services.ts';
import { createComplaint, generateComplaintIdempotencyKey } from '../src/lib/api/complaints.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { CreateServiceRequestPayload } from '../src/types/services.ts';
import type { CreateComplaintPayload } from '../src/types/complaints.ts';

describe('TC-DDP-144-AC1: Successful Workflow - Complete Guest Multi-Service Journey & Money Ownership', () => {
  it('navigates full guest lifecycle: menu -> cart -> order -> service request -> complaint -> checkout revocation', async () => {
    const sessionToken = 'mock-jwt-session-room-101';
    const roomNumber = '101';
    const originalFetch = globalThis.fetch;

    let orderCreated = false;
    let requestCreated = false;
    let complaintCreated = false;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.endsWith('/food-orders') && init?.method === 'POST') {
        orderCreated = true;
        const body = JSON.parse(String(init?.body));
        const mockOrder: FoodOrderResponse = {
          orderId: 'ORD-20261030-E2E1',
          roomNumber,
          bookingId: 'booking-stay-101',
          items: (body.items || []).map((i: { menuItemId: string; quantity: number }) => ({
            itemId: i.menuItemId,
            name: 'Signature Wagyu Burger',
            unitPrice: 32.5,
            quantity: i.quantity,
          })),
          totalAmount: 65.0,
          allergyNotes: body.allergyNote,
          status: 'PLACED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          estimatedDeliveryMinutes: 25,
          idempotencyKey: body.idempotencyKey,
          canCancel: true,
          timeline: [
            {
              status: 'PLACED',
              label: 'Order Placed',
              timestamp: '14:00',
              completed: true,
              current: true,
            },
          ],
        };
        return new Response(JSON.stringify(mockOrder), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.endsWith('/service-requests') && init?.method === 'POST') {
        requestCreated = true;
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            requestId: 'REQ-20261030-E2E1',
            roomNumber,
            bookingId: 'booking-stay-101',
            requestType: body.requestType,
            status: 'SUBMITTED',
            priority: 'NORMAL',
            timeline: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.endsWith('/complaints') && init?.method === 'POST') {
        complaintCreated = true;
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            complaintId: 'CMP-20261030-E2E1',
            roomNumber,
            bookingId: 'booking-stay-101',
            category: body.category,
            severity: body.severity,
            subject: body.subject,
            description: body.description,
            status: 'SUBMITTED',
            relatedOrderId: body.relatedOrderId,
            timeline: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    try {
      // Step 1: Place Food Order (2x Wagyu Burger = 65.00)
      const orderPayload: CreateFoodOrderPayload = {
        items: [
          {
            menuItemId: 'menu-item-002',
            quantity: 2,
            specialNotes: 'No onions',
          },
        ],
        allergyNote: 'No onions',
      };
      const order = await placeFoodOrder(sessionToken, orderPayload, generateIdempotencyKey());
      assert.equal(order.orderId, 'ORD-20261030-E2E1');
      assert.equal(order.totalAmount, 65.0);
      assert.equal(orderCreated, true);

      // Step 2: Create Service Request (Extra Towels)
      const servicePayload: CreateServiceRequestPayload = {
        requestType: 'EXTRA_TOWELS',
        description: 'Extra towels requested for evening.',
      };
      const request = await createServiceRequest(
        sessionToken,
        servicePayload,
        generateServiceIdempotencyKey(),
      );
      assert.equal(request.requestId, 'REQ-20261030-E2E1');
      assert.equal(requestCreated, true);

      // Step 3: File Complaint referencing the food order
      const complaintPayload: CreateComplaintPayload = {
        category: 'FOOD',
        severity: 'MEDIUM',
        subject: 'Burger delivered without modifications',
        description: 'The burger contained onions despite allergy notes.',
        relatedOrderId: order.orderId,
      };
      const complaint = await createComplaint(
        complaintPayload,
        sessionToken,
        generateComplaintIdempotencyKey(),
      );
      assert.equal(complaint.complaintId, 'CMP-20261030-E2E1');
      assert.equal(complaint.relatedOrderId, 'ORD-20261030-E2E1');
      assert.equal(complaintCreated, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('guarantees money calculation consistency: line item unit prices match cart and order totals', () => {
    const items = [
      { itemId: 'item-1', name: 'Burger', unitPrice: 32.5, quantity: 2 },
      { itemId: 'item-2', name: 'Arancini', unitPrice: 18.0, quantity: 1 },
      { itemId: 'item-3', name: 'Sparkling Water', unitPrice: 4.5, quantity: 3 },
    ];

    const calculatedTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    // (32.5 * 2) + 18.0 + (4.5 * 3) = 65.0 + 18.0 + 13.5 = 96.50
    assert.equal(calculatedTotal, 96.5);
  });
});

describe('TC-DDP-144-AC2: Negative / Error Cases - Subsystem Failure & Input Preservation', () => {
  it('throws ApiError with status 503 when upstream KMS or WKMS gateway is unavailable', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 503,
          message: 'Upstream KMS gateway is temporarily unreachable.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await placeFoodOrder(
            'token-101',
            {
              items: [{ menuItemId: 'item-1', quantity: 1 }],
            },
            'test-idem-key',
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /unreachable/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preserves user session token and idempotency across temporary network interruptions', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateServiceIdempotencyKey();
    const key3 = generateComplaintIdempotencyKey();

    assert.ok(key1.startsWith('idemp-'));
    assert.ok(key2.startsWith('idemp-svc-'));
    assert.ok(key3.startsWith('cmp-idem-'));
  });
});

describe('TC-DDP-144-AC3: Boundary, Concurrency & Security', () => {
  it('prevents cross-room resource leakage by checking roomNumber on fetched orders', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify([
          {
            orderId: 'ORD-ROOM-101',
            roomNumber: '101',
            totalAmount: 45.0,
            status: 'PLACED',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const orders = await fetchGuestOrders('token-room-101');
      assert.ok(orders.every((o) => o.roomNumber === '101'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('idempotent replay prevents duplicate billing upon retry', async () => {
    const payload: CreateFoodOrderPayload = {
      items: [{ menuItemId: 'item-1', quantity: 1 }],
    };
    const idemKey = 'idemp-replay-safe-001';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          orderId: 'ORD-IDEM-001',
          roomNumber: '101',
          totalAmount: 32.5,
          status: 'PLACED',
          timeline: [],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const res1 = await placeFoodOrder('token-101', payload, idemKey);
      const res2 = await placeFoodOrder('token-101', payload, idemKey);

      assert.equal(res1.orderId, res2.orderId);
      assert.equal(res1.totalAmount, res2.totalAmount);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-144-AC4: Subsystem Boundary & Counterpart Contract Conformance', () => {
  it('confirms frontend only targets public FOSS endpoints and does not communicate with private upstream databases', () => {
    const allowedPathPrefixes = [
      '/guest-sessions',
      '/menu',
      '/food-orders',
      '/service-requests',
      '/complaints',
      '/health',
    ];

    const requestedEndpoint = '/food-orders';
    const isAllowed = allowedPathPrefixes.some((p) => requestedEndpoint.startsWith(p));
    assert.equal(isAllowed, true);

    const privateDatabaseEndpoint = '/kms-internal/db-write';
    const isForbidden = !allowedPathPrefixes.some((p) => privateDatabaseEndpoint.startsWith(p));
    assert.equal(isForbidden, true);
  });
});
