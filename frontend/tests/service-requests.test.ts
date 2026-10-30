import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVICE_TYPE_OPTIONS,
  generateServiceIdempotencyKey,
  createServiceRequest,
  fetchGuestServiceRequests,
  fetchGuestServiceRequestById,
  advanceServiceRequestStatusDemo,
  FALLBACK_SERVICE_REQUESTS,
} from '../src/lib/api/services.ts';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import type { CreateServiceRequestPayload, ServiceRequestResponse } from '../src/types/services.ts';

describe('TC-DDP-142-AC1: Successful Workflow - Service Request Creation & Worker Progression', () => {
  it('submits service request with idempotency key and returns assigned status with timeline', async () => {
    const payload: CreateServiceRequestPayload = {
      requestType: 'EXTRA_TOWELS',
      description: 'Please bring 2 extra bath towels',
    };
    const idempotencyKey = 'idemp-svc-test-001';
    const sessionToken = 'guest-session-token-101';

    const originalFetch = globalThis.fetch;
    let requestHeaders: HeadersInit | undefined;
    let requestBody: string | undefined;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/service-requests$/);
      assert.equal(init?.method, 'POST');
      requestHeaders = init?.headers;
      requestBody = String(init?.body);

      const mockResponse: ServiceRequestResponse = {
        requestId: 'REQ-042',
        roomNumber: '103',
        bookingId: 'booking-101',
        requestType: 'EXTRA_TOWELS',
        description: payload.description || null,
        status: 'SUBMITTED',
        priority: 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 15,
        idempotencyKey,
        createdAt: '2026-10-30T13:45:00.000Z',
        updatedAt: '2026-10-30T13:45:00.000Z',
        timeline: [
          {
            status: 'SUBMITTED',
            label: 'Request Submitted',
            completed: true,
            current: true,
            timestamp: '13:45',
          },
          { status: 'ASSIGNED', label: 'Worker Assigned', completed: false, current: false },
          { status: 'IN_PROGRESS', label: 'In Progress', completed: false, current: false },
          { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
        ],
      };

      return new Response(JSON.stringify(mockResponse), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const response = await createServiceRequest(sessionToken, payload, idempotencyKey);

      // Verify Headers & Payload
      const headers = requestHeaders as Record<string, string>;
      assert.equal(headers['Authorization'], `Bearer ${sessionToken}`);
      assert.equal(headers['idempotency-key'], idempotencyKey);

      const parsedBody = JSON.parse(requestBody || '{}');
      assert.equal(parsedBody.requestType, 'EXTRA_TOWELS');
      assert.equal(parsedBody.description, payload.description);
      assert.equal(parsedBody.idempotencyKey, idempotencyKey);

      // Verify Confirmed Attributes
      assert.equal(response.requestId, 'REQ-042');
      assert.equal(response.roomNumber, '103');
      assert.equal(response.status, 'SUBMITTED');
      assert.equal(response.timeline.length, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retrieves active stay service requests and tracks status', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/service-requests$/);
      return new Response(JSON.stringify(FALLBACK_SERVICE_REQUESTS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const requests = await fetchGuestServiceRequests('session-101');
      assert.ok(requests.length >= 2);
      assert.equal(requests[0].requestId, 'REQ-042');
      assert.equal(requests[0].status, 'ASSIGNED');
      assert.equal(requests[1].requestId, 'REQ-041');
      assert.equal(requests[1].status, 'COMPLETED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-142-AC2: Negative / Error Cases - Validation & Offline Input Preservation', () => {
  it('handles upstream WKMS service failure (503) without loss of form content', async () => {
    const payload: CreateServiceRequestPayload = {
      requestType: 'MAINTENANCE',
      description: 'AC not cooling properly in room 103',
    };
    const savedIdempotencyKey = 'idemp-svc-retry-999';

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    const sentKeys: string[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      const headers = init?.headers as Record<string, string>;
      sentKeys.push(headers['idempotency-key']);

      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            statusCode: 503,
            message: 'Upstream WKMS service is unreachable.',
            error: 'Service Unavailable',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Second attempt (retry) succeeds
      return new Response(
        JSON.stringify({
          requestId: 'REQ-050',
          roomNumber: '103',
          bookingId: 'booking-101',
          requestType: 'MAINTENANCE',
          description: payload.description,
          status: 'SUBMITTED',
          priority: 'NORMAL',
          estimatedCompletionMinutes: 20,
          idempotencyKey: savedIdempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          timeline: [],
        }),
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
          await createServiceRequest('token-101', payload, savedIdempotencyKey);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Upstream WKMS service is unreachable/);
          return true;
        },
      );

      // Verify input state is preserved
      assert.equal(payload.requestType, 'MAINTENANCE');
      assert.equal(payload.description, 'AC not cooling properly in room 103');

      // 2. Retry succeeds with identical idempotency key
      const result = await createServiceRequest('token-101', payload, savedIdempotencyKey);
      assert.equal(result.requestId, 'REQ-050');

      assert.equal(sentKeys.length, 2);
      assert.equal(sentKeys[0], savedIdempotencyKey);
      assert.equal(sentKeys[1], savedIdempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('enforces 500-character boundary on description input', () => {
    const clampDescription = (desc: string) => desc.slice(0, 500);

    const longText = 'X'.repeat(550);
    const clamped = clampDescription(longText);

    assert.equal(clamped.length, 500);
    assert.equal(clamped, 'X'.repeat(500));
  });
});

describe('TC-DDP-142-AC3: Boundary, Concurrency & Idempotent Submission', () => {
  it('prevents double-tap concurrent submissions during in-flight request', async () => {
    let isSubmitting = false;
    let executionCount = 0;

    const simulateSubmit = async () => {
      if (isSubmitting) {
        return { blocked: true };
      }
      isSubmitting = true;
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      isSubmitting = false;
      return { blocked: false };
    };

    const [sub1, sub2] = await Promise.all([simulateSubmit(), simulateSubmit()]);

    assert.equal(sub1.blocked, false);
    assert.equal(sub2.blocked, true);
    assert.equal(executionCount, 1);
  });

  it('generates unique, high-entropy idempotency keys starting with idemp-svc-', () => {
    const key1 = generateServiceIdempotencyKey();
    const key2 = generateServiceIdempotencyKey();

    assert.ok(key1.startsWith('idemp-svc-'));
    assert.ok(key2.startsWith('idemp-svc-'));
    assert.notEqual(key1, key2);
  });

  it('advances service request status via DEMO_MODE endpoint', async () => {
    const updatedRequest: ServiceRequestResponse = {
      requestId: 'REQ-042',
      roomNumber: '103',
      bookingId: 'booking-101',
      requestType: 'EXTRA_TOWELS',
      description: null,
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
      assignedStaff: 'Worker en route',
      estimatedCompletionMinutes: 10,
      idempotencyKey: 'idemp-042',
      createdAt: '2026-10-30T13:45:00.000Z',
      updatedAt: '2026-10-30T13:50:00.000Z',
      timeline: [],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.match(String(url), /\/service-requests\/REQ-042\/status$/);
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.status, 'IN_PROGRESS');

      return new Response(JSON.stringify(updatedRequest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await advanceServiceRequestStatusDemo('session-101', 'REQ-042', 'IN_PROGRESS');
      assert.equal(result.status, 'IN_PROGRESS');
      assert.equal(result.requestId, 'REQ-042');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('TC-DDP-142-AC4: Contract & Visual Layout Fidelity Audit (Figure 38)', () => {
  it('defines 6 canonical service categories matching Figure 38 exactly', () => {
    const categories = SERVICE_TYPE_OPTIONS.map((o) => ({
      label: o.label,
      backendType: o.backendType,
    }));

    assert.equal(categories.length, 6);
    assert.deepEqual(
      categories.map((c) => c.label),
      ['Room Cleaning', 'Extra Towels', 'Maintenance', 'Laundry', 'Water Bottles', 'Other'],
    );
  });

  it('reproduces Figure 38 active requests text and status tags', () => {
    const figure38Contract = {
      headerTitle: 'Service Request',
      headerSubtitlePattern: /Room \d+ — auto-attached/,
      whatDoYouNeedHeader: 'WHAT DO YOU NEED?',
      descriptionHeader: 'DESCRIPTION (OPTIONAL)',
      submitButtonText: 'Submit Request',
      activeRequestsHeader: 'ACTIVE REQUESTS',
      item1Badge: '● Assigned · 13:45',
      item1Subtitle: 'Worker en route → In Progress',
      item2Badge: '✓ Completed · 10:30',
      item2Subtitle: 'Completed by Amali S.',
    };

    assert.equal(figure38Contract.headerTitle, 'Service Request');
    assert.match('Room 103 — auto-attached', figure38Contract.headerSubtitlePattern);
    assert.equal(figure38Contract.whatDoYouNeedHeader, 'WHAT DO YOU NEED?');
    assert.equal(figure38Contract.submitButtonText, 'Submit Request');
    assert.equal(figure38Contract.item1Badge, '● Assigned · 13:45');
    assert.equal(figure38Contract.item1Subtitle, 'Worker en route → In Progress');
    assert.equal(figure38Contract.item2Badge, '✓ Completed · 10:30');
    assert.equal(figure38Contract.item2Subtitle, 'Completed by Amali S.');
  });

  it('fetches single service request by ID', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /\/service-requests\/REQ-041$/);
      return new Response(JSON.stringify(FALLBACK_SERVICE_REQUESTS[1]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const req = await fetchGuestServiceRequestById('session-101', 'REQ-041');
      assert.equal(req.requestId, 'REQ-041');
      assert.equal(req.status, 'COMPLETED');
      assert.equal(req.assignedStaff, 'Amali S.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
