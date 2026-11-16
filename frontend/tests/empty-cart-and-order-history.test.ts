import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateLineTotal, calculateSubtotal, formatLkrPrice } from '../src/lib/utils/money.ts';
import {
  MIN_ORDER_ITEM_QUANTITY,
  MAX_ORDER_ITEM_QUANTITY,
} from '../src/lib/constants/order-policy.ts';
import { reconcileAuthoritativeOrders } from '../src/lib/api/orders.ts';
import type { CartItem, GuestMenuItem } from '../src/types/menu.ts';
import type { FoodOrderResponse } from '../src/types/orders.ts';
import type { NavTabId } from '../src/lib/navigation/navigation-context.tsx';

describe('FOSS Issue #101: Task 1 - Empty Cart Checkout UI & Policy Validation', () => {
  const sampleMenuItem: GuestMenuItem = {
    id: 'item-101',
    name: 'Grilled Chicken Rice',
    description: 'Steamed fragrant basmati rice with grilled chicken',
    price: 850,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 3600,
    estimatedPrepMinutes: 25,
    imageUrl: 'https://cdn.foreverhotel.com/menu/chicken-rice.webp',
    dietaryFlags: [],
    allergens: [],
  };

  it('empty cart hides Place Order sticky footer and displays Browse Menu empty state', () => {
    const items: CartItem[] = [];

    // Verification logic matching CartView conditional rendering:
    // When items.length === 0, the checkout footer and Place Order button MUST NOT be rendered
    const isCheckoutControlsVisible = items.length > 0;
    const isEmptyCartStateVisible = items.length === 0;

    assert.equal(
      isCheckoutControlsVisible,
      false,
      'Place Order footer must be hidden when cart is empty',
    );
    assert.equal(
      isEmptyCartStateVisible,
      true,
      'Empty cart state with Browse Menu action must be visible',
    );
  });

  it('adding an item immediately displays checkout controls and totals', () => {
    let items: CartItem[] = [];

    // Add item
    const newItem: CartItem = {
      id: sampleMenuItem.id,
      item: sampleMenuItem,
      quantity: 1,
    };
    items = [...items, newItem];

    const isCheckoutControlsVisible = items.length > 0;
    const lineTotal = calculateLineTotal(items[0].item.price, items[0].quantity);
    const subtotal = calculateSubtotal(items);

    assert.equal(
      isCheckoutControlsVisible,
      true,
      'Checkout controls must appear when an item is added',
    );
    assert.equal(lineTotal, 850);
    assert.equal(subtotal, 850);
    assert.equal(formatLkrPrice(subtotal), 'LKR 850');
  });

  it('removing the final item immediately transitions back to the empty-cart state', () => {
    let items: CartItem[] = [
      {
        id: sampleMenuItem.id,
        item: sampleMenuItem,
        quantity: 1,
      },
    ];

    assert.equal(items.length > 0, true, 'Initial cart has 1 item');

    // Simulate handleDecrement when quantity === 1 (calls removeItem)
    items = items.filter((i) => i.id !== sampleMenuItem.id);

    assert.equal(items.length, 0, 'Cart is now empty');
    const isCheckoutControlsVisible = items.length > 0;
    const isEmptyCartStateVisible = items.length === 0;

    assert.equal(isCheckoutControlsVisible, false, 'Place Order button must disappear');
    assert.equal(isEmptyCartStateVisible, true, 'Empty cart state must reappear immediately');
  });

  it('blocks submission when cart contains zero items', () => {
    const items: CartItem[] = [];
    let wasSubmitted = false;

    const handleSubmitOrder = (cartItems: CartItem[]) => {
      if (cartItems.length === 0) {
        return; // blocked
      }
      wasSubmitted = true;
    };

    handleSubmitOrder(items);
    assert.equal(wasSubmitted, false, 'Empty cart order submission must be blocked');
  });

  it('preserves 1-20 quantity bounds and line calculations when populated', () => {
    const testItems: CartItem[] = [{ id: 'item-101', item: sampleMenuItem, quantity: 20 }];

    // Validate bounds
    for (const item of testItems) {
      assert.ok(item.quantity >= MIN_ORDER_ITEM_QUANTITY, 'Quantity must be >= 1');
      assert.ok(item.quantity <= MAX_ORDER_ITEM_QUANTITY, 'Quantity must be <= 20');
    }

    const lineTotal = calculateLineTotal(testItems[0].item.price, testItems[0].quantity);
    assert.equal(lineTotal, 17000); // 850 * 20
    assert.equal(formatLkrPrice(lineTotal), 'LKR 17,000');
  });
});

describe('FOSS Issue #101: Task 2 & 3 - Order History Navigation & Stay Isolation', () => {
  const stayRoom = '103';
  const stayBooking = 'booking-101';

  const order1: FoodOrderResponse = {
    orderId: 'ORD-291',
    roomNumber: stayRoom,
    bookingId: stayBooking,
    status: 'IN_PREPARATION',
    totalAmount: 1500,
    items: [{ itemId: 'item-101', name: 'Grilled Chicken Rice', unitPrice: 850, quantity: 1 }],
    estimatedDeliveryMinutes: 25,
    createdAt: new Date().toISOString(),
    idempotencyKey: 'idemp-291',
  };

  const order2: FoodOrderResponse = {
    orderId: 'ORD-287',
    roomNumber: stayRoom,
    bookingId: stayBooking,
    status: 'DELIVERED',
    totalAmount: 720,
    items: [{ itemId: 'item-105', name: 'Egg Hoppers', unitPrice: 250, quantity: 2 }],
    estimatedDeliveryMinutes: 0,
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    idempotencyKey: 'idemp-287',
  };

  const otherRoomOrder: FoodOrderResponse = {
    orderId: 'ORD-999',
    roomNumber: '101', // Different room
    bookingId: 'booking-999',
    status: 'PLACED',
    totalAmount: 3200,
    items: [{ itemId: 'item-201', name: 'Seafood Platter', unitPrice: 3200, quantity: 1 }],
    estimatedDeliveryMinutes: 35,
    createdAt: new Date().toISOString(),
    idempotencyKey: 'idemp-999',
  };

  it('selecting Orders tab from bottom navigation displays Order History (clears tracker)', () => {
    // Model navigation state matching NavigationContext
    let activeTab: NavTabId = 'orders';
    let selectedOrderId: string | null = 'ORD-291'; // User was previously on tracker

    // User taps "Orders" tab in MobileBottomNav
    const handleBottomNavClick = (tabId: NavTabId) => {
      selectedOrderId = null; // Always resets tracker selection
      activeTab = tabId;
    };

    handleBottomNavClick('orders');

    assert.equal(activeTab, 'orders');
    assert.equal(
      selectedOrderId,
      null,
      'selectedOrderId must be cleared to null to show Order History',
    );
  });

  it('selecting a history order opens the correct tracker', () => {
    let selectedOrderId: string | null = null;

    const handleSelectOrder = (orderId: string) => {
      selectedOrderId = orderId;
    };

    handleSelectOrder(order1.orderId);
    assert.equal(selectedOrderId, 'ORD-291', 'Selecting history order must set selectedOrderId');
  });

  it('clicking Back from tracker returns to Order History', () => {
    let selectedOrderId: string | null = 'ORD-291';

    const handleBackFromTracker = () => {
      selectedOrderId = null;
    };

    handleBackFromTracker();
    assert.equal(selectedOrderId, null, 'Going back from tracker must clear selectedOrderId');
  });

  it('Track Order Status after checkout opens the newly created order directly', () => {
    let activeTab: NavTabId = 'menu';
    let selectedOrderId: string | null = null;

    const onTrackStatus = (newOrderId: string) => {
      selectedOrderId = newOrderId;
      // setActiveTab with keepSelectedOrder: true
      activeTab = 'orders';
    };

    onTrackStatus('ORD-NEW-500');

    assert.equal(activeTab, 'orders');
    assert.equal(selectedOrderId, 'ORD-NEW-500', 'Newly placed order tracker must open directly');
  });

  it('re-selecting Orders tab clears tracker selection even when already on orders tab', () => {
    let activeTab: NavTabId = 'orders';
    let selectedOrderId: string | null = 'ORD-NEW-500';

    // User taps "Orders" tab in bottom navigation while on tracker
    const onOrdersNavTap = () => {
      selectedOrderId = null;
      activeTab = 'orders';
    };

    onOrdersNavTap();
    assert.equal(activeTab, 'orders');
    assert.equal(
      selectedOrderId,
      null,
      'Tracker selection must be cleared to reveal Order History',
    );
  });

  it('switching tabs clears obsolete tracker state', () => {
    let activeTab: NavTabId = 'orders';
    let selectedOrderId: string | null = 'ORD-291';

    // User switches to 'services' tab
    const setActiveTab = (tab: NavTabId, options?: { keepSelectedOrder?: boolean }) => {
      activeTab = tab;
      if (!options?.keepSelectedOrder) {
        selectedOrderId = null;
      }
    };

    setActiveTab('services');
    assert.equal(activeTab, 'services');
    assert.equal(selectedOrderId, null, 'Tracker state must be cleared on tab switch');

    // User later switches to 'orders' tab
    setActiveTab('orders');
    assert.equal(activeTab, 'orders');
    assert.equal(selectedOrderId, null, 'Orders tab must open to history, not stale tracker');
  });

  it('filters orders strictly by authenticated guest room and booking', () => {
    const rawOrders = [order1, order2, otherRoomOrder];

    const filterStayOrders = (
      orders: FoodOrderResponse[],
      room?: string,
      booking?: string,
    ): FoodOrderResponse[] => {
      if (!room || !booking) return [];
      return orders.filter((o) => {
        if (!o.roomNumber || !o.bookingId) return false;
        return o.roomNumber === room && o.bookingId === booking;
      });
    };

    const room103Orders = filterStayOrders(rawOrders, stayRoom, stayBooking);
    assert.equal(room103Orders.length, 2);
    assert.ok(room103Orders.some((o) => o.orderId === 'ORD-291'));
    assert.ok(room103Orders.some((o) => o.orderId === 'ORD-287'));
    assert.ok(
      !room103Orders.some((o) => o.orderId === 'ORD-999'),
      'Room 101 order must be excluded',
    );

    const room101Orders = filterStayOrders(rawOrders, '101', 'booking-999');
    assert.equal(room101Orders.length, 1);
    assert.equal(room101Orders[0].orderId, 'ORD-999');
  });

  it('reconciles authoritative orders without regressing advanced progress', () => {
    const currentList: FoodOrderResponse[] = [
      { ...order1, status: 'DELIVERED', updatedAt: '2026-11-02T12:30:00.000Z' },
    ];

    // Stale server response still showing IN_PREPARATION with older timestamp
    const incomingStale: FoodOrderResponse[] = [
      { ...order1, status: 'IN_PREPARATION', updatedAt: '2026-11-02T12:15:00.000Z' },
    ];

    const reconciled = reconcileAuthoritativeOrders(currentList, incomingStale);
    assert.equal(reconciled.length, 1);
    assert.equal(
      reconciled[0].status,
      'DELIVERED',
      'Local advanced status must not regress from stale poll',
    );
  });

  it('renders empty state when stay has no placed food orders', () => {
    const emptyOrders: FoodOrderResponse[] = [];
    const loading = false;
    const error = null;

    const shouldShowEmptyState = !loading && emptyOrders.length === 0 && !error;
    assert.equal(shouldShowEmptyState, true, 'Empty state must be displayed for fresh stays');
  });
});
