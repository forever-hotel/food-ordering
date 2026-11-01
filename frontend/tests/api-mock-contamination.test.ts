import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/guest-sessions.ts';
import {
  fetchGuestServiceRequests,
  createServiceRequest,
  fetchGuestServiceRequestById,
} from '../src/lib/api/services.ts';
import {
  fetchGuestComplaints,
  createComplaint,
  fetchGuestComplaintById,
} from '../src/lib/api/complaints.ts';
import { fetchGuestMenu, fetchMenuItem, fetchMealWindows } from '../src/lib/api/menu.ts';
import { placeFoodOrder } from '../src/lib/api/orders.ts';

describe('Regression Tests: Elimination of Mock Contamination in Authenticated Flows (#101, FUI-03)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Service Requests API', () => {
    it('returns empty array [] when backend returns [] without substituting Room 103 mock data', async () => {
      global.fetch = async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const result = await fetchGuestServiceRequests('valid-token-101');
      assert.deepEqual(result, [], 'Expected empty array for stay with no service requests');
    });

    it('throws ApiError 503 on network error during list fetch without returning mock fallback', async () => {
      global.fetch = async () => {
        throw new Error('Connection refused');
      };

      await assert.rejects(
        async () => {
          await fetchGuestServiceRequests('valid-token-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Connection refused/);
          return true;
        },
      );
    });

    it('throws ApiError 503 on network error during creation without fabricating Room 103 request', async () => {
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      await assert.rejects(
        async () => {
          await createServiceRequest('valid-token-101', {
            requestType: 'TOWELS',
            description: 'Extra towels for Room 101',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    });

    it('throws ApiError on HTTP error when fetching request by ID without returning mock match', async () => {
      global.fetch = async () =>
        new Response(JSON.stringify({ message: 'Request not found for this stay' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });

      await assert.rejects(
        async () => {
          await fetchGuestServiceRequestById('valid-token-101', 'REQ-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 404);
          assert.equal(err.message, 'Request not found for this stay');
          return true;
        },
      );
    });
  });

  describe('Complaints API', () => {
    it('returns empty array [] when backend returns [] without substituting Room 103 mock complaints', async () => {
      global.fetch = async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const result = await fetchGuestComplaints('valid-token-101');
      assert.deepEqual(result, [], 'Expected empty array for stay with no complaints');
    });

    it('throws ApiError 503 on network error during list complaints without returning mock fallback', async () => {
      global.fetch = async () => {
        throw new Error('Network timeout');
      };

      await assert.rejects(
        async () => {
          await fetchGuestComplaints('valid-token-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Network timeout/);
          return true;
        },
      );
    });

    it('throws ApiError 503 on network error during complaint submission without fabricating Room 103 record', async () => {
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      await assert.rejects(
        async () => {
          await createComplaint(
            {
              category: 'FOOD',
              severity: 'MEDIUM',
              subject: 'Cold soup',
              description: 'Soup was served cold',
            },
            'valid-token-101',
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    });

    it('throws ApiError 503 on network error when retrieving complaint by ID without returning mock match', async () => {
      global.fetch = async () => {
        throw new Error('Connection reset by peer');
      };

      await assert.rejects(
        async () => {
          await fetchGuestComplaintById('CMP-2026-001', 'valid-token-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    });
  });

  describe('Menu API', () => {
    it('throws ApiError 503 on network error when retrieving catalog without substituting mock menu', async () => {
      global.fetch = async () => {
        throw new Error('Server unreachable');
      };

      await assert.rejects(
        async () => {
          await fetchGuestMenu('valid-token-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Server unreachable/);
          return true;
        },
      );
    });

    it('throws ApiError 503 on network error when retrieving meal windows', async () => {
      global.fetch = async () => {
        throw new Error('Network drop');
      };

      await assert.rejects(
        async () => {
          await fetchMealWindows('valid-token-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    });

    it('throws ApiError 503 on network error when retrieving single menu item', async () => {
      global.fetch = async () => {
        throw new Error('Connection refused');
      };

      await assert.rejects(
        async () => {
          await fetchMenuItem('valid-token-101', 'item-101');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    });
  });

  describe('Food Orders API', () => {
    it('throws ApiError 503 on network error during placeFoodOrder without fabricating mock confirmation', async () => {
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      await assert.rejects(
        async () => {
          await placeFoodOrder(
            'valid-token-101',
            {
              items: [{ menuItemId: 'item-101', quantity: 1 }],
            },
            'idemp-test-101',
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /Failed to fetch/);
          return true;
        },
      );
    });
  });
});
