import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApiError } from '../src/lib/data-mode/api-error.ts';
import { ApiMenuProvider } from '../src/lib/data-mode/api/api-menu.provider.ts';
import { ApiServicesProvider } from '../src/lib/data-mode/api/api-services.provider.ts';
import { ApiComplaintsProvider } from '../src/lib/data-mode/api/api-complaints.provider.ts';
import {
  getOrdersProvider,
  getMenuProvider,
  getServicesProvider,
  getComplaintsProvider,
  getSessionsProvider,
} from '../src/lib/data-mode/provider-factory.ts';
import { setDataMode, resetDataModeForTesting } from '../src/lib/data-mode/data-mode.ts';

describe('ProviderFactory Data Mode Dispatching', () => {
  it('dispatches to API providers when data mode is api', () => {
    setDataMode('api');
    try {
      assert.ok(getOrdersProvider() instanceof Object);
      assert.ok(getMenuProvider() instanceof ApiMenuProvider);
      assert.ok(getServicesProvider() instanceof ApiServicesProvider);
      assert.ok(getComplaintsProvider() instanceof ApiComplaintsProvider);
      assert.ok(getSessionsProvider() instanceof Object);
    } finally {
      resetDataModeForTesting();
    }
  });

  it('dispatches to Demo providers when data mode is demo', () => {
    setDataMode('demo');
    try {
      assert.ok(!(getMenuProvider() instanceof ApiMenuProvider));
      assert.ok(!(getServicesProvider() instanceof ApiServicesProvider));
      assert.ok(!(getComplaintsProvider() instanceof ApiComplaintsProvider));
    } finally {
      resetDataModeForTesting();
    }
  });
});

describe('ApiMenuProvider Comprehensive Scenarios', () => {
  const provider = new ApiMenuProvider();
  const originalFetch = globalThis.fetch;

  it('fetchGuestMenu builds query parameters and returns catalog response', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      assert.ok(urlStr.includes('category=MAINS'));
      assert.ok(urlStr.includes('mealPeriod=LUNCH'));
      assert.ok(urlStr.includes('availableOnly=true'));
      assert.ok(urlStr.includes('search=chicken'));
      assert.equal((init?.headers as Record<string, string>)?.Authorization, 'Bearer token-123');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 'item-1', name: 'Curry Rice', price: 850, available: true }],
        }),
      } as Response;
    }) as any;

    try {
      const result = await provider.fetchGuestMenu('token-123', {
        category: 'MAINS',
        mealPeriod: 'LUNCH',
        availableOnly: true,
        search: 'chicken',
      });
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].id, 'item-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestMenu throws ApiError with error property when response is not ok', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid meal period query' }),
    })) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestMenu(),
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, 'Invalid meal period query');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestMenu falls back when response json fails or non-error is thrown', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Malformed JSON');
      },
    })) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestMenu(),
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 500);
          assert.equal(err.message, 'Failed to fetch menu items.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Non-error throw
    globalThis.fetch = (async () => {
      throw 'Raw string throw';
    }) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestMenu(),
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          assert.equal(err.message, 'Unable to connect to menu service.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestMenuItem returns null on 404', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    })) as any;

    try {
      const result = await provider.fetchGuestMenuItem('missing-item');
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestMenuItem returns item when ok and throws ApiError on non-404 error', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'item-2', name: 'Kottu', price: 900 }),
    })) as any;

    try {
      const result = await provider.fetchGuestMenuItem('item-2', 'token-abc');
      assert.equal(result?.id, 'item-2');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => null,
    })) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestMenuItem('item-2'),
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 500);
          assert.equal(err.message, 'Item item-2 not found.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => {
      throw 'Raw string throw on item';
    }) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestMenuItem('item-2'),
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          assert.equal(err.message, 'Unable to fetch menu item details.');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('ApiServicesProvider Comprehensive Scenarios', () => {
  const provider = new ApiServicesProvider();
  const originalFetch = globalThis.fetch;

  it('asserts valid session tokens and rejects empty or demo tokens with 401', async () => {
    await assert.rejects(
      async () => provider.fetchGuestServiceRequests(''),
      (err: any) => err instanceof ApiError && err.status === 401,
    );

    await assert.rejects(
      async () => provider.fetchGuestServiceRequests('demo-token-101'),
      (err: any) => err instanceof ApiError && err.status === 401,
    );

    await assert.rejects(
      async () => provider.fetchGuestServiceRequests('101'),
      (err: any) => err instanceof ApiError && err.status === 401,
    );
  });

  it('fetchGuestServiceRequests handles array responses, { requests: [] }, and non-array fallback', async () => {
    // Array
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 'req-1' }],
    })) as any;

    try {
      const res1 = await provider.fetchGuestServiceRequests('real-token-uuid');
      assert.equal(res1.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // { requests: [] }
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ requests: [{ id: 'req-2' }] }),
    })) as any;

    try {
      const res2 = await provider.fetchGuestServiceRequests('real-token-uuid');
      assert.equal(res2.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // neither
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ invalid: true }),
    })) as any;

    try {
      const res3 = await provider.fetchGuestServiceRequests('real-token-uuid');
      assert.deepEqual(res3, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestServiceRequestById returns item or throws appropriate ApiError', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ requestId: 'req-1', status: 'SUBMITTED' }),
    })) as any;

    try {
      const item = await provider.fetchGuestServiceRequestById('real-token-uuid', 'req-1');
      assert.equal(item.requestId, 'req-1');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => null,
    })) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestServiceRequestById('real-token-uuid', 'req-1'),
        (err: any) => err instanceof ApiError && err.status === 404,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('createServiceRequest creates request with optional and default parameters', async () => {
    let capturedBody: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ requestId: 'req-created', ...capturedBody }),
      } as any;
    }) as any;

    try {
      const res = await provider.createServiceRequest(
        'real-token-uuid',
        { requestType: 'TOWELS', description: 'Two towels', priority: 'HIGH' } as any,
        'custom-idemp-1',
      );
      assert.equal(res.requestId, 'req-created');
      assert.equal(capturedBody.priority, 'HIGH');
      assert.equal(capturedBody.idempotencyKey, 'custom-idemp-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('advanceDemoServiceRequestStatus executes status update and handles failures', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'req-1', status: 'IN_PROGRESS' }),
    })) as any;

    try {
      const res = await provider.advanceDemoServiceRequestStatus(
        'real-token-uuid',
        'req-1',
        'IN_PROGRESS' as any,
        'Staff Member',
      );
      assert.equal(res.status, 'IN_PROGRESS');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Demo advance not permitted' }),
    })) as any;

    try {
      await assert.rejects(
        async () =>
          provider.advanceDemoServiceRequestStatus('real-token-uuid', 'req-1', 'COMPLETED' as any),
        (err: any) => err instanceof ApiError && err.status === 403,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('ApiComplaintsProvider Comprehensive Scenarios', () => {
  const provider = new ApiComplaintsProvider();
  const originalFetch = globalThis.fetch;

  it('asserts valid session tokens on complaints operations', async () => {
    await assert.rejects(
      async () => provider.fetchGuestComplaints(''),
      (err: any) => err instanceof ApiError && err.status === 401,
    );

    await assert.rejects(
      async () => provider.fetchGuestComplaintById('demo-token-101', 'c-1'),
      (err: any) => err instanceof ApiError && err.status === 401,
    );
  });

  it('fetchGuestComplaints handles array, { complaints: [] }, and non-array fallback', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ complaints: [{ id: 'c-1' }] }),
    })) as any;

    try {
      const res = await provider.fetchGuestComplaints('real-token-uuid');
      assert.equal(res.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => 'not an array or object',
    })) as any;

    try {
      const res = await provider.fetchGuestComplaints('real-token-uuid');
      assert.deepEqual(res, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchGuestComplaintById returns complaint or throws ApiError', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ complaintId: 'c-1', subject: 'Noise' }),
    })) as any;

    try {
      const complaint = await provider.fetchGuestComplaintById('real-token-uuid', 'c-1');
      assert.equal(complaint.complaintId, 'c-1');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => null,
    })) as any;

    try {
      await assert.rejects(
        async () => provider.fetchGuestComplaintById('real-token-uuid', 'c-missing'),
        (err: any) => err instanceof ApiError && err.status === 404,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('createComplaint and advanceDemoComplaintStatus execute successfully', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 201,
      json: async () => ({ complaintId: 'c-new', status: 'SUBMITTED' }),
    })) as any;

    try {
      const res = await provider.createComplaint(
        { subject: 'AC issue', description: 'Not cooling', category: 'ROOM_FACILITY' } as any,
        'real-token-uuid',
      );
      assert.equal(res.complaintId, 'c-new');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ complaintId: 'c-new', status: 'RESOLVED' }),
    })) as any;

    try {
      const res = await provider.advanceDemoComplaintStatus(
        'real-token-uuid',
        'c-new',
        'RESOLVED' as any,
      );
      assert.equal(res.status, 'RESOLVED');
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => null,
    })) as any;

    try {
      await assert.rejects(
        async () =>
          provider.advanceDemoComplaintStatus('real-token-uuid', 'c-new', 'RESOLVED' as any),
        (err: any) => err instanceof ApiError && err.status === 500,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('ApiOrdersProvider Comprehensive Scenarios', () => {
  const originalFetch = globalThis.fetch;

  it('fetchGuestOrders handles { orders: [] }, non-array fallback, and advanceDemoOrderStatus error', async () => {
    const { ApiOrdersProvider } = await import('../src/lib/data-mode/api/api-orders.provider.ts');
    const provider = new ApiOrdersProvider();

    // { orders: [] }
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ orders: [{ orderId: 'ORD-101' }] }),
    })) as any;

    try {
      const res1 = await provider.fetchGuestOrders('real-token-uuid');
      assert.equal(res1.length, 1);
      assert.equal(res1[0].orderId, 'ORD-101');
    } finally {
      globalThis.fetch = originalFetch;
    }

    // neither array nor object with orders
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => 'raw-string-response',
    })) as any;

    try {
      const res2 = await provider.fetchGuestOrders('real-token-uuid');
      assert.deepEqual(res2, []);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // advanceDemoOrderStatus failure
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid transition' }),
    })) as any;

    try {
      await assert.rejects(
        async () =>
          provider.advanceDemoOrderStatus('real-token-uuid', 'ORD-101', 'DELIVERED' as any),
        (err: any) => err instanceof ApiError && err.status === 400,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('DemoMenuProvider Filtering Scenarios', () => {
  it('filters menu by category, mealPeriod, availableOnly, and search', async () => {
    const { DemoMenuProvider } = await import('../src/lib/data-mode/demo/demo-menu.provider.ts');
    const provider = new DemoMenuProvider();

    const resCategory = await provider.fetchGuestMenu(undefined, { category: 'MAINS' });
    assert.ok(resCategory.items.every((i) => i.category.toLowerCase() === 'mains'));

    const resMeal = await provider.fetchGuestMenu(undefined, { mealPeriod: 'LUNCH' });
    assert.ok(resMeal.items.length > 0);

    const resAvail = await provider.fetchGuestMenu(undefined, { availableOnly: true });
    assert.ok(resAvail.items.every((i) => i.available && !i.isCutoff));

    const resSearch = await provider.fetchGuestMenu(undefined, { search: 'chicken' });
    assert.ok(resSearch.items.length > 0);

    const item = await provider.fetchGuestMenuItem('menu-item-001');
    assert.equal(item?.id, 'menu-item-001');

    const missingItem = await provider.fetchGuestMenuItem('non-existent');
    assert.equal(missingItem, null);
  });
});

describe('DemoSessionsProvider Scenarios', () => {
  it('covers validation, fetchCurrentSession, logout, and demo token listing', async () => {
    const { DemoSessionsProvider } =
      await import('../src/lib/data-mode/demo/demo-sessions.provider.ts');
    const provider = new DemoSessionsProvider();

    // redeem with empty token
    await assert.rejects(
      async () => provider.redeemQrToken(''),
      (err: any) => err instanceof ApiError && err.status === 400,
    );

    // fetchCurrentSession with empty token
    await assert.rejects(
      async () => provider.fetchCurrentSession(''),
      (err: any) => err instanceof ApiError && err.status === 401,
    );

    // fetchCurrentSession with non-demo token
    await assert.rejects(
      async () => provider.fetchCurrentSession('real-api-token-123'),
      (err: any) => err instanceof ApiError && err.status === 401,
    );

    // fetchCurrentSession with valid demo token
    const context = await provider.fetchCurrentSession('demo-token-room-101');
    assert.equal(context.roomNumber, '101');
    assert.equal(context.role, 'GUEST');

    // logoutSession
    const logoutRes = await provider.logoutSession('demo-token-101');
    assert.equal(logoutRes.success, true);

    // fetchDemoTokens
    const tokens = await provider.fetchDemoTokens();
    assert.ok(Object.keys(tokens).length > 0);

    // resetDemo
    const resetRes = await provider.resetDemo();
    assert.equal(resetRes.success, true);
  });
});
