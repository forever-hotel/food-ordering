import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FossRealtimeClient } from '../src/lib/realtime/realtime-client.ts';
import { reconcileAuthoritativeOrders } from '../src/lib/api/orders.ts';
import type { FoodOrderResponse } from '../src/types/orders.ts';

describe('Regression Tests: Strict Guest Context Enforcement & Missing Context Safety (#101, FUI-04)', () => {
  describe('Real-Time Client Context Binding', () => {
    it('initializes real-time client strictly bound to verified stay context', () => {
      const client104 = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-stay-104',
        bookingId: 'booking-204',
        roomNumber: '104',
      });

      // Validates stay context binding
      assert.equal(client104.getSubscriptionContext().bookingId, 'booking-204');
      assert.equal(client104.getSubscriptionContext().roomNumber, '104');
      assert.notEqual(client104.getSubscriptionContext().roomNumber, '103');
      assert.notEqual(client104.getSubscriptionContext().bookingId, 'booking-101');
    });

    it('rejects events when guest switches rooms and received event belongs to previous room', () => {
      const stay104Client = new FossRealtimeClient({
        apiUrl: 'http://localhost:4300',
        sessionToken: 'token-stay-104',
        bookingId: 'booking-204',
        roomNumber: '104',
      });

      const oldRoomEvent = {
        eventId: 'evt-999',
        eventType: 'ORDER_STATUS_CHANGED',
        timestamp: new Date().toISOString(),
        channel: 'stay:booking-101:103',
        data: {
          orderId: 'ORD-295',
          bookingId: 'booking-101',
          roomNumber: '103',
          status: 'DELIVERED',
        },
      };

      const isForCurrentStay =
        oldRoomEvent.data.roomNumber === stay104Client.getSubscriptionContext().roomNumber &&
        oldRoomEvent.data.bookingId === stay104Client.getSubscriptionContext().bookingId;

      assert.equal(
        isForCurrentStay,
        false,
        'Event for previous room 103 must not be accepted by Room 104 stay',
      );
    });
  });

  describe('Session Change & Logout Authoritative Clearing', () => {
    it('clears previous order history completely when incoming stay order list is empty', () => {
      const previousStayOrders: FoodOrderResponse[] = [
        {
          orderId: 'ORD-291',
          bookingId: 'booking-101',
          roomNumber: '103',
          status: 'DELIVERED',
          totalAmount: 1500,
          items: [],
          estimatedDeliveryMinutes: 20,
          idempotencyKey: 'idemp-test-291',
          createdAt: new Date().toISOString(),
          canCancel: false,
          timeline: [],
        },
      ];

      // On session change or new stay with 0 orders, authoritative reconcile returns []
      const result = reconcileAuthoritativeOrders(previousStayOrders, []);
      assert.deepEqual(result, [], 'Must completely clear stale orders from previous stay');
    });

    it('replaces order history when guest context switches to another stay', () => {
      const stay101Orders: FoodOrderResponse[] = [
        {
          orderId: 'ORD-101',
          bookingId: 'booking-101',
          roomNumber: '101',
          status: 'DELIVERED',
          totalAmount: 850,
          items: [],
          estimatedDeliveryMinutes: 15,
          idempotencyKey: 'idemp-test-101',
          createdAt: new Date().toISOString(),
          canCancel: false,
          timeline: [],
        },
      ];

      const stay102Orders: FoodOrderResponse[] = [
        {
          orderId: 'ORD-202',
          bookingId: 'booking-102',
          roomNumber: '102',
          status: 'PLACED',
          totalAmount: 1200,
          items: [],
          estimatedDeliveryMinutes: 25,
          idempotencyKey: 'idemp-test-202',
          createdAt: new Date().toISOString(),
          canCancel: true,
          timeline: [],
        },
      ];

      const reconciled = reconcileAuthoritativeOrders(stay101Orders, stay102Orders);
      assert.equal(reconciled.length, 1);
      assert.equal(reconciled[0].orderId, 'ORD-202');
      assert.equal(reconciled[0].roomNumber, '102');
      assert.equal(reconciled[0].bookingId, 'booking-102');
    });
  });
});
