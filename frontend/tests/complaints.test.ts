import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLAINT_CATEGORY_OPTIONS,
  COMPLAINT_SEVERITY_OPTIONS,
  generateComplaintIdempotencyKey,
  createComplaint,
  fetchGuestComplaints,
  fetchGuestComplaintById,
  advanceComplaintStatusDemo,
  FALLBACK_COMPLAINTS,
} from '../src/lib/api/complaints.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { CreateComplaintPayload, ComplaintResponse } from '../src/types/complaints.ts';

describe('TC-DDP-143-AC1: Successful Workflow - Complaint Creation & Lifecycle Tracking', () => {
  it('submits complaint with idempotency key, headers, and returns reference ID with progression timeline', async () => {
    const payload: CreateComplaintPayload = {
      category: 'FOOD',
      severity: 'HIGH',
      subject: 'Undercooked chicken delivered',
      description: 'The chicken in order #ORD-291 was undercooked and cold on arrival.',
      relatedOrderId: 'order-291',
    };
    const idempotencyKey = 'idemp-cmp-test-001';
    const sessionToken = 'guest-session-token-103';

    const originalFetch = globalThis.fetch;
    let requestHeaders: HeadersInit | undefined;
    let requestBody: string | undefined;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/complaints$/);
      assert.equal(init?.method, 'POST');
      requestHeaders = init?.headers;
      requestBody = String(init?.body);

      const mockResponse: ComplaintResponse = {
        complaintId: 'CMP-20261030-F001',
        roomNumber: '103',
        bookingId: 'booking-stay-103',
        category: payload.category,
        severity: payload.severity,
        subject: payload.subject,
        description: payload.description,
        status: 'SUBMITTED',
        relatedOrderId: payload.relatedOrderId || null,
        relatedRequestId: null,
        assignedManager: null,
        resolutionNotes: null,
        createdAt: '2026-10-30T13:45:00.000Z',
        updatedAt: '2026-10-30T13:45:00.000Z',
        timeline: [
          {
            status: 'SUBMITTED',
            label: 'Complaint Submitted',
            completed: true,
            current: true,
            timestamp: '13:45',
          },
          {
            status: 'UNDER_INVESTIGATION',
            label: 'Under Investigation',
            completed: false,
            current: false,
          },
          {
            status: 'ESCALATED',
            label: 'Escalated to GM',
            completed: false,
            current: false,
          },
          {
            status: 'RESOLVED',
            label: 'Resolved',
            completed: false,
            current: false,
          },
        ],
      };

      return new Response(JSON.stringify(mockResponse), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await createComplaint(payload, sessionToken, idempotencyKey);

      assert.equal(result.complaintId, 'CMP-20261030-F001');
      assert.equal(result.roomNumber, '103');
      assert.equal(result.category, 'FOOD');
      assert.equal(result.severity, 'HIGH');
      assert.equal(result.status, 'SUBMITTED');
      assert.equal(result.timeline.length, 4);
      assert.equal(result.timeline[0].completed, true);
      assert.equal(result.timeline[0].current, true);

      // Verify header and payload forwarding
      const headersObj = requestHeaders as Record<string, string>;
      assert.equal(headersObj['Authorization'], `Bearer ${sessionToken}`);
      assert.equal(headersObj['x-idempotency-key'], idempotencyKey);

      const parsedBody = JSON.parse(requestBody || '{}');
      assert.equal(parsedBody.idempotencyKey, idempotencyKey);
      assert.equal(parsedBody.relatedOrderId, 'order-291');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetches current stay complaints list including assigned manager and timeline', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/complaints$/);
      return new Response(JSON.stringify(FALLBACK_COMPLAINTS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const list = await fetchGuestComplaints('test-session-token');
      assert.ok(Array.isArray(list));
      assert.ok(list.length >= 2);
      assert.equal(list[0].complaintId, 'CMP-20261030-F001');
      assert.equal(list[0].assignedManager, 'Duty Manager Sarah K.');
      assert.equal(list[1].complaintId, 'CMP-20261029-N002');
      assert.equal(list[1].status, 'RESOLVED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetches specific complaint details by ID', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/complaints\/CMP-20261030-F001$/);
      return new Response(JSON.stringify(FALLBACK_COMPLAINTS[0]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const item = await fetchGuestComplaintById('CMP-20261030-F001', 'token-123');
      assert.equal(item.complaintId, 'CMP-20261030-F001');
      assert.equal(item.category, 'FOOD');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-143-AC2: Negative & Error Cases - Foreign References and Validation', () => {
  it('throws ApiError when backend reports foreign order reference from another stay', async () => {
    const payload: CreateComplaintPayload = {
      category: 'FOOD',
      severity: 'HIGH',
      subject: 'Foreign order referenced',
      description: 'Attempting to reference someone else order in complaint',
      relatedOrderId: 'order-999-foreign',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          statusCode: 400,
          message:
            'Referenced food order [order-999-foreign] does not belong to the current guest stay.',
          error: 'Bad Request',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await createComplaint(payload, 'token-103');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /does not belong to the current guest stay/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('gracefully provides deterministic fallback complaint when network is unreachable in demo mode', async () => {
    const payload: CreateComplaintPayload = {
      category: 'NOISE',
      severity: 'MEDIUM',
      subject: 'Hallway commotion during midnight',
      description: 'Loud footsteps and door slamming outside room 103 for over an hour.',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('Failed to fetch (offline simulated network drop)');
    }) as typeof fetch;

    try {
      const fallback = await createComplaint(payload, 'offline-token');
      assert.ok(fallback.complaintId.startsWith('CMP-'));
      assert.equal(fallback.roomNumber, '103');
      assert.equal(fallback.category, 'NOISE');
      assert.equal(fallback.status, 'SUBMITTED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws 404 when complaint ID is not found in API or fallback registry', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Complaint not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchGuestComplaintById('CMP-NONEXISTENT', 'token-103');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-143-AC3: Boundary, Idempotency & Visual Accessibility', () => {
  it('generates unique client-side idempotency keys with standard cmp-idem prefix', () => {
    const key1 = generateComplaintIdempotencyKey();
    const key2 = generateComplaintIdempotencyKey();

    assert.ok(key1.startsWith('cmp-idem-'));
    assert.ok(key2.startsWith('cmp-idem-'));
    assert.notEqual(key1, key2);
  });

  it('replays identical complaint response without duplicating upon replay', async () => {
    const payload: CreateComplaintPayload = {
      category: 'CLEANLINESS',
      severity: 'LOW',
      subject: 'Dust on bedside table',
      description: 'A light layer of dust was noticed on the bedside reading table.',
    };
    const idempotencyKey = 'idemp-replay-key-001';

    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          complaintId: 'CMP-20261030-REPLAY',
          roomNumber: '103',
          bookingId: 'booking-stay-103',
          category: payload.category,
          severity: payload.severity,
          subject: payload.subject,
          description: payload.description,
          status: 'SUBMITTED',
          createdAt: '2026-10-30T13:00:00.000Z',
          updatedAt: '2026-10-30T13:00:00.000Z',
          timeline: [],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const res1 = await createComplaint(payload, 'token-103', idempotencyKey);
      const res2 = await createComplaint(payload, 'token-103', idempotencyKey);

      assert.equal(res1.complaintId, 'CMP-20261030-REPLAY');
      assert.equal(res2.complaintId, 'CMP-20261030-REPLAY');
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('advances complaint status in demo mode for evaluator rehearsal', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/complaints\/CMP-20261030-F001\/status$/);
      assert.equal(init?.method, 'PATCH');

      const body = JSON.parse(String(init?.body));
      assert.equal(body.status, 'RESOLVED');

      return new Response(
        JSON.stringify({
          ...FALLBACK_COMPLAINTS[0],
          status: 'RESOLVED',
          resolutionNotes: 'Replacement meal delivered with complimentary dessert voucher.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const updated = await advanceComplaintStatusDemo(
        'CMP-20261030-F001',
        'RESOLVED',
        'token-103',
        'Replacement meal delivered with complimentary dessert voucher.',
      );

      assert.equal(updated.status, 'RESOLVED');
      assert.match(String(updated.resolutionNotes), /complimentary dessert voucher/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('provides accessible severity visual cues (symbols, colors, labels) matching Figure 39', () => {
    assert.equal(COMPLAINT_SEVERITY_OPTIONS.length, 4);

    const low = COMPLAINT_SEVERITY_OPTIONS.find((s) => s.level === 'LOW');
    const med = COMPLAINT_SEVERITY_OPTIONS.find((s) => s.level === 'MEDIUM');
    const high = COMPLAINT_SEVERITY_OPTIONS.find((s) => s.level === 'HIGH');
    const urgent = COMPLAINT_SEVERITY_OPTIONS.find((s) => s.level === 'URGENT');

    assert.ok(low);
    assert.ok(med);
    assert.ok(high);
    assert.ok(urgent);

    // High severity must contain visual checkmark symbol per Figure 39
    assert.match(high.label, /High ✓/);
    assert.equal(high.color, '#DC2626');

    // Urgent must provide warning indicator
    assert.match(urgent.label, /Urgent ⚠️/);
  });
});

describe('TC-DDP-143-AC4: Contract Conformance & Security Audit', () => {
  it('confirms all 6 Figure 39 complaint categories are supported by API options', () => {
    assert.equal(COMPLAINT_CATEGORY_OPTIONS.length, 6);

    const values = COMPLAINT_CATEGORY_OPTIONS.map((c) => c.value);
    assert.deepEqual(values, ['FOOD', 'SERVICE', 'CLEANLINESS', 'NOISE', 'AMENITY', 'OTHER']);
  });

  it('ensures payload does not leak unauthorized fields or private tokens', async () => {
    const payload: CreateComplaintPayload = {
      category: 'AMENITY',
      severity: 'LOW',
      subject: 'Television remote batteries weak',
      description: 'The TV remote takes multiple presses to change channels.',
      idempotencyKey: 'clean-key-001',
    };

    let sentPayload: Record<string, unknown> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      sentPayload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(FALLBACK_COMPLAINTS[0]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await createComplaint(payload, 'safe-session-token');

      // Check that sensitive tokens or booking internals are not leaked in body
      assert.equal(sentPayload['password'], undefined);
      assert.equal(sentPayload['qrCode'], undefined);
      assert.equal(sentPayload['creditCard'], undefined);
      assert.equal(sentPayload['category'], 'AMENITY');
      assert.equal(sentPayload['severity'], 'LOW');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
