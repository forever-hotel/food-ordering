import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDataMode,
  setDataMode,
  resetDataModeForTesting,
  setDeploymentEnvForTesting,
  getSessionStorageKey,
  isDemoAllowed,
  isProduction,
} from '../src/lib/data-mode/data-mode.ts';
import { DemoScenarioClock, demoStateStore } from '../src/lib/data-mode/demo/demo-state-store.ts';
import { ApiError } from '../src/lib/data-mode/api-error.ts';
import { fetchGuestOrders } from '../src/lib/api/orders.ts';
import { fetchCurrentSession, redeemQrToken } from '../src/lib/api/guest-sessions.ts';
import {
  disconnectAllRealtimeClients,
  FossRealtimeClient,
} from '../src/lib/realtime/realtime-client.ts';
import { DemoOrdersProvider } from '../src/lib/data-mode/demo/demo-orders.provider.ts';

// Mock minimal browser storage & window for testing environment
class MockStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

describe('FOSS — Harden Demo/API Mode Switching, Session Isolation & Lifecycle (#101)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockSessionStorage: MockStorage;
  let mockLocalStorage: MockStorage;

  beforeEach(() => {
    mockSessionStorage = new MockStorage();
    mockLocalStorage = new MockStorage();

    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockLocalStorage,
      sessionStorage: mockSessionStorage,
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((l) => l !== listener);
      },
      dispatchEvent: (event: { type: string; detail?: unknown }) => {
        const list = listeners[event.type] || [];
        for (const l of list) {
          l(event);
        }
        return true;
      },
    };

    resetDataModeForTesting();
    setDeploymentEnvForTesting(null);
    DemoScenarioClock.reset();
    demoStateStore.resetToInitial();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    disconnectAllRealtimeClients();
    delete (globalThis as unknown as { window?: unknown }).window;
    resetDataModeForTesting();
    setDeploymentEnvForTesting(null);
    DemoScenarioClock.reset();
    demoStateStore.resetToInitial();
  });

  describe('1. Safe Mode Switching & Storage Partitioning', () => {
    it('partitions session tokens strictly between Demo and API mode keys', () => {
      assert.equal(getSessionStorageKey('demo'), 'foss_guest_session_token_demo');
      assert.equal(getSessionStorageKey('api'), 'foss_guest_session_token_api');
    });

    it('clears previous mode session token on mode switch', () => {
      setDataMode('demo');
      mockSessionStorage.setItem(getSessionStorageKey('demo'), 'demo-token-room-101');
      assert.equal(mockSessionStorage.getItem(getSessionStorageKey('demo')), 'demo-token-room-101');

      // Switch to API mode
      setDataMode('api');
      assert.equal(mockSessionStorage.getItem(getSessionStorageKey('demo')), null);
      assert.equal(mockSessionStorage.getItem(getSessionStorageKey('api')), null);
    });

    it('disconnects active realtime clients on teardown', () => {
      let disconnectedCount = 0;
      const client1 = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'demo-token-room-101',
        bookingId: 'booking-101',
        roomNumber: '101',
      });
      const client2 = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'demo-token-room-102',
        bookingId: 'booking-102',
        roomNumber: '102',
      });

      // Hook disconnect
      const origDisc1 = client1.disconnect.bind(client1);
      client1.disconnect = () => {
        disconnectedCount++;
        origDisc1();
      };
      const origDisc2 = client2.disconnect.bind(client2);
      client2.disconnect = () => {
        disconnectedCount++;
        origDisc2();
      };

      client1.connect();
      client2.connect();

      disconnectAllRealtimeClients();
      assert.equal(disconnectedCount, 2);
    });

    it('rejects demo tokens in API mode with 401', async () => {
      setDataMode('api');

      await assert.rejects(
        async () => fetchGuestOrders('demo-token-room-101'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          assert.match(err.message, /Demonstration session tokens cannot be transmitted/i);
          return true;
        },
      );

      await assert.rejects(
        async () => redeemQrToken('act-demo-101'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.match(err.message, /Demonstration QR tokens cannot be redeemed/i);
          return true;
        },
      );
    });

    it('rejects non-existent session tokens with 401', async () => {
      await assert.rejects(
        async () => fetchGuestOrders('real-jwt-or-opaque-token-12345'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          return true;
        },
      );

      await assert.rejects(
        async () => fetchCurrentSession('real-jwt-or-opaque-token-12345'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });
  });

  describe('2. Authentication Lifecycle Race Condition Guarding', () => {
    it('simulates generation counter: delayed QR redemption response does not clobber state after logout', async () => {
      let requestId = 0;
      let activeGuest: { roomNumber: string } | null = null;

      // Simulated login action
      const performLogin = async (token: string, delayMs: number) => {
        const currentReqId = ++requestId;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // If request ID changed (e.g. user logged out or switched room), discard result!
        if (currentReqId !== requestId) {
          return { aborted: true };
        }

        activeGuest = { roomNumber: token === 'act-demo-101' ? '101' : '102' };
        return { aborted: false, guest: activeGuest };
      };

      const performLogout = () => {
        requestId++;
        activeGuest = null;
      };

      // Trigger slow login for Room 101
      const loginPromise = performLogin('act-demo-101', 50);

      // Immediately log out while login is in flight
      performLogout();

      const result = await loginPromise;
      assert.equal(result.aborted, true);
      assert.equal(activeGuest, null);
    });

    it('simulates generation counter: rapid room switching discards obsolete responses', async () => {
      let requestId = 0;
      let activeGuest: { roomNumber: string } | null = null;

      const switchRoom = async (roomNumber: string, delayMs: number) => {
        const currentReqId = ++requestId;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (currentReqId !== requestId) {
          return { aborted: true };
        }

        activeGuest = { roomNumber };
        return { aborted: false, guest: activeGuest };
      };

      // First request (slow): switch to Room 101
      const req1 = switchRoom('101', 60);

      // Second request (fast): switch to Room 102
      await new Promise((r) => setTimeout(r, 10));
      const req2 = switchRoom('102', 10);

      const res2 = await req2;
      assert.equal(res2.aborted, false);
      assert.equal((activeGuest as { roomNumber: string } | null)?.roomNumber, '102');

      const res1 = await req1;
      assert.equal(res1.aborted, true);
      // Active guest must NOT revert to Room 101!
      assert.equal((activeGuest as { roomNumber: string } | null)?.roomNumber, '102');
    });
  });

  describe('3. Deterministic Scenario Clock & Stay Lifecycle', () => {
    beforeEach(() => {
      setDataMode('demo');
    });

    it('dynamically computes active stays for Rooms 101, 102, 103, and 204 relative to clock', () => {
      const stays = demoStateStore.getStays();
      const stay101 = stays.find((s) => s.roomNumber === '101');
      const stay102 = stays.find((s) => s.roomNumber === '102');
      const stay103 = stays.find((s) => s.roomNumber === '103');
      const stay204 = stays.find((s) => s.roomNumber === '204');
      const stayExpired = stays.find((s) => s.roomNumber === '999');

      assert.ok(stay101);
      assert.equal(stay101.isExpired, false);
      assert.ok(new Date(stay101.checkOut) > DemoScenarioClock.now());

      assert.ok(stay102);
      assert.equal(stay102.isExpired, false);

      assert.ok(stay103);
      assert.equal(stay103.isExpired, false);

      assert.ok(stay204);
      assert.equal(stay204.isExpired, false);

      assert.ok(stayExpired);
      assert.equal(stayExpired.isExpired, true);
    });

    it('advancing clock past 10 minutes invalidates order cancellation window', async () => {
      const demoOrdersProvider = new DemoOrdersProvider();
      // Place an order in Room 103
      const order = await demoOrdersProvider.placeFoodOrder(
        'demo-token-room-103',
        {
          items: [{ menuItemId: 'menu-item-001', quantity: 2 }],
          allergyNote: 'Extra spicy',
        },
        'idemp-test-cancel-1',
      );
      assert.equal(order.status, 'PLACED');

      // Cancellation should succeed immediately after placement
      const canCancelInitially = await demoOrdersProvider.cancelFoodOrder(
        'demo-token-room-103',
        order.orderId,
        'Changed mind',
      );
      assert.equal(canCancelInitially.status, 'CANCELLED');

      // Place another order
      const order2 = await demoOrdersProvider.placeFoodOrder(
        'demo-token-room-103',
        {
          items: [{ menuItemId: 'menu-item-002', quantity: 1 }],
        },
        'idemp-test-cancel-2',
      );

      // Advance clock by 11 minutes (past 10 min cutoff)
      DemoScenarioClock.advance(11 * 60 * 1000);

      // Cancellation should now fail with 409 Conflict
      await assert.rejects(
        async () =>
          demoOrdersProvider.cancelFoodOrder('demo-token-room-103', order2.orderId, 'Too late'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 409);
          assert.match(err.message, /Cancellation window has expired/i);
          return true;
        },
      );
    });

    it('resetting DemoScenarioClock restores initial state and time', () => {
      const initialTime = DemoScenarioClock.now().getTime();
      DemoScenarioClock.advance(5 * 24 * 60 * 60 * 1000); // 5 days later
      assert.ok(DemoScenarioClock.now().getTime() > initialTime);

      demoStateStore.reset();
      assert.equal(DemoScenarioClock.isOverridden(), false);
    });
  });

  describe('4. Multi-Tier Deployment Safety & Policies', () => {
    it('permits Demo Mode in development tier', () => {
      setDeploymentEnvForTesting('development');
      assert.equal(isDemoAllowed(), true);
      assert.equal(isProduction(), false);
    });

    it('strictly forbids Demo Mode in staging tier', () => {
      setDeploymentEnvForTesting('staging');
      assert.equal(isDemoAllowed(), false);
      assert.equal(getDataMode(), 'api');

      assert.throws(() => setDataMode('demo'), /cannot be activated in staging/i);
    });

    it('strictly forbids Demo Mode in production tier', () => {
      setDeploymentEnvForTesting('production');
      assert.equal(isDemoAllowed(), false);
      assert.equal(isProduction(), true);
      assert.equal(getDataMode(), 'api');

      assert.throws(() => setDataMode('demo'), /cannot be activated in production/i);
    });

    it('permits Demo Mode in preview tier ONLY when explicitly authorized', () => {
      setDeploymentEnvForTesting('preview');
      delete process.env.NEXT_PUBLIC_ALLOW_DEMO_PREVIEW;
      delete process.env.NEXT_PUBLIC_DATA_MODE;

      assert.equal(isDemoAllowed(), false);

      // Now explicitly authorize preview
      process.env.NEXT_PUBLIC_ALLOW_DEMO_PREVIEW = 'true';
      assert.equal(isDemoAllowed(), true);
    });
  });
});
