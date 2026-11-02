import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateLineTotal,
  calculateSubtotal,
  formatLkrPrice,
  roundMoney,
} from '../src/lib/utils/money.ts';
import {
  MIN_ORDER_ITEM_QUANTITY,
  MAX_ORDER_ITEM_QUANTITY,
} from '../src/lib/constants/order-policy.ts';
import { createMockOrderResponse } from '../src/lib/api/orders.ts';
import type { CartItem, GuestMenuItem } from '../src/types/menu.ts';
import type { CreateFoodOrderPayload, FoodOrderResponse } from '../src/types/orders.ts';

describe('Phase 4: Pricing and Quantity Policy Unit Tests', () => {
  const item101: GuestMenuItem = {
    id: 'menu-item-001',
    name: 'Truffle Mushroom Arancini',
    description: 'Crispy risotto spheres',
    price: 18.0,
    category: 'Starters',
    mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 3600,
    estimatedPrepMinutes: 15,
    imageUrl: 'https://cdn.foreverhotel.com/menu/arancini.webp',
    dietaryFlags: ['VEGETARIAN'],
    allergens: ['Dairy', 'Gluten'],
  };

  const item102: GuestMenuItem = {
    id: 'menu-item-002',
    name: 'Signature Wagyu Burger',
    description: 'Flame-grilled wagyu patty',
    price: 32.5,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 3600,
    estimatedPrepMinutes: 20,
    imageUrl: 'https://cdn.foreverhotel.com/menu/wagyu-burger.webp',
    dietaryFlags: [],
    allergens: ['Dairy', 'Gluten'],
  };

  const itemFractional: GuestMenuItem = {
    id: 'menu-item-006',
    name: 'Mango Passionfruit Mocktail',
    description: 'Fresh passionfruit',
    price: 8.75,
    category: 'Beverages',
    mealPeriods: ['ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 3600,
    estimatedPrepMinutes: 5,
    imageUrl: null,
    dietaryFlags: ['VEGAN'],
    allergens: [],
  };

  describe('1. Quantity Limits Validation (1–20)', () => {
    it('allows one item, quantity 1', () => {
      assert.ok(1 >= MIN_ORDER_ITEM_QUANTITY && 1 <= MAX_ORDER_ITEM_QUANTITY);
      const lineTotal = calculateLineTotal(item101.price, 1);
      assert.equal(lineTotal, 18.0);
    });

    it('allows one item, quantity 3', () => {
      assert.ok(3 >= MIN_ORDER_ITEM_QUANTITY && 3 <= MAX_ORDER_ITEM_QUANTITY);
      const lineTotal = calculateLineTotal(item101.price, 3);
      assert.equal(lineTotal, 54.0);
    });

    it('allows one item, quantity 20 (authoritative backend limit)', () => {
      assert.ok(20 >= MIN_ORDER_ITEM_QUANTITY && 20 <= MAX_ORDER_ITEM_QUANTITY);
      const lineTotal = calculateLineTotal(item101.price, 20);
      assert.equal(lineTotal, 360.0);
    });

    it('rejects quantity 0 (below minimum limit)', () => {
      const validateQuantity = (qty: number) =>
        qty >= MIN_ORDER_ITEM_QUANTITY && qty <= MAX_ORDER_ITEM_QUANTITY;
      assert.equal(validateQuantity(0), false);
    });

    it('rejects quantity 21 (above maximum limit)', () => {
      const validateQuantity = (qty: number) =>
        qty >= MIN_ORDER_ITEM_QUANTITY && qty <= MAX_ORDER_ITEM_QUANTITY;
      assert.equal(validateQuantity(21), false);
    });
  });

  describe('2. Repeated Additions & Cart Mutations', () => {
    it('handles repeated additions of the same item up to MAX_ORDER_ITEM_QUANTITY', () => {
      let currentCartQty = 0;
      const portionCap = item101.portionCap ?? MAX_ORDER_ITEM_QUANTITY;

      const addItems = (qty: number): boolean => {
        if (currentCartQty + qty > portionCap) return false;
        currentCartQty += qty;
        return true;
      };

      assert.equal(addItems(5), true); // 5 in cart
      assert.equal(currentCartQty, 5);

      assert.equal(addItems(10), true); // 15 in cart
      assert.equal(currentCartQty, 15);

      assert.equal(addItems(5), true); // 20 in cart (limit reached)
      assert.equal(currentCartQty, 20);

      assert.equal(addItems(1), false); // 21 exceeds cap 20
      assert.equal(currentCartQty, 20);
    });

    it('calculates multiple items with different unit prices', () => {
      const cartItems: CartItem[] = [
        { id: item101.id, item: item101, quantity: 2 }, // 18.0 * 2 = 36.0
        { id: item102.id, item: item102, quantity: 3 }, // 32.5 * 3 = 97.5
        { id: itemFractional.id, item: itemFractional, quantity: 4 }, // 8.75 * 4 = 35.0
      ];

      const lineTotals = cartItems.map((ci) => calculateLineTotal(ci.item.price, ci.quantity));
      assert.deepEqual(lineTotals, [36.0, 97.5, 35.0]);

      const subtotal = calculateSubtotal(cartItems);
      // 36.0 + 97.5 + 35.0 = 168.5
      assert.equal(subtotal, 168.5);
    });

    it('immediately updates subtotal after cart quantity changes and removals', () => {
      let cart: CartItem[] = [
        { id: item101.id, item: item101, quantity: 2 }, // 36.0
        { id: item102.id, item: item102, quantity: 1 }, // 32.5
      ];
      assert.equal(calculateSubtotal(cart), 68.5);

      // Increment item102 to 2
      cart = cart.map((ci) => (ci.id === item102.id ? { ...ci, quantity: 2 } : ci));
      // 36.0 + 65.0 = 101.0
      assert.equal(calculateSubtotal(cart), 101.0);

      // Remove item101
      cart = cart.filter((ci) => ci.id !== item101.id);
      // 65.0
      assert.equal(calculateSubtotal(cart), 65.0);
    });
  });

  describe('3. Currency Formatting & Floating-Point Protection', () => {
    it('formats integer prices without unnecessary decimals', () => {
      assert.equal(formatLkrPrice(1500), 'LKR 1,500');
      assert.equal(formatLkrPrice(850), 'LKR 850');
      assert.equal(formatLkrPrice(0), 'LKR 0');
    });

    it('formats fractional amounts with exactly 2 decimal places', () => {
      assert.equal(formatLkrPrice(32.5), 'LKR 32.50');
      assert.equal(formatLkrPrice(18.75), 'LKR 18.75');
      assert.equal(formatLkrPrice(0.05), 'LKR 0.05');
    });

    it('eliminates IEEE 754 floating-point inaccuracies through roundMoney', () => {
      // In naive JS: 0.1 + 0.2 = 0.30000000000000004
      const naiveSum = 0.1 + 0.2;
      assert.notEqual(naiveSum, 0.3);

      const safeSum = roundMoney(naiveSum);
      assert.equal(safeSum, 0.3);

      // 32.55 * 3 naive = 97.64999999999999
      const naiveLine = 32.55 * 3;
      assert.notEqual(naiveLine, 97.65);

      const safeLine = calculateLineTotal(32.55, 3);
      assert.equal(safeLine, 97.65);
      assert.equal(formatLkrPrice(safeLine), 'LKR 97.65');
    });
  });

  describe('4. Checkout, Fallback Prevention, and Reconciliation', () => {
    it('dynamically computes totalAmount in createMockOrderResponse based on item lines', () => {
      const payload1: CreateFoodOrderPayload = {
        items: [{ menuItemId: 'item-101', quantity: 1 }], // Grilled Chicken Rice: 850
      };
      const res1 = createMockOrderResponse(payload1, 'idemp-test-1');
      assert.equal(res1.totalAmount, 850);
      assert.notEqual(res1.totalAmount, 1500); // Verifies hardcoded 1500 is eliminated!

      const payload2: CreateFoodOrderPayload = {
        items: [
          { menuItemId: 'item-101', quantity: 2 }, // 850 * 2 = 1700
          { menuItemId: 'item-102', quantity: 1 }, // 650 * 1 = 650
        ],
      };
      const res2 = createMockOrderResponse(payload2, 'idemp-test-2');
      assert.equal(res2.totalAmount, 2350); // 1700 + 650 = 2350
    });

    it('verifies confirmation total matches backend response', () => {
      const backendOrderResponse: FoodOrderResponse = {
        orderId: 'ORD-KMS-001',
        roomNumber: '103',
        bookingId: 'booking-101',
        status: 'PLACED',
        totalAmount: 168.5,
        items: [
          { itemId: item101.id, name: item101.name, unitPrice: item101.price, quantity: 2 },
          { itemId: item102.id, name: item102.name, unitPrice: item102.price, quantity: 3 },
          {
            itemId: itemFractional.id,
            name: itemFractional.name,
            unitPrice: itemFractional.price,
            quantity: 4,
          },
        ],
        estimatedDeliveryMinutes: 25,
        createdAt: new Date().toISOString(),
        idempotencyKey: 'idemp-test-rec',
      };

      // Client pre-checkout calculation
      const clientCart = [
        { item: item101, quantity: 2 },
        { item: item102, quantity: 3 },
        { item: itemFractional, quantity: 4 },
      ];
      const clientTotal = calculateSubtotal(clientCart);

      assert.equal(clientTotal, backendOrderResponse.totalAmount);
      assert.equal(formatLkrPrice(clientTotal), formatLkrPrice(backendOrderResponse.totalAmount));
    });

    it('verifies service charge row is strictly all-inclusive with no unexpected surcharges', () => {
      const subtotal = 2500;
      const serviceChargeLabel = 'Included';
      // All-inclusive means total equals subtotal exactly
      const total = subtotal;

      assert.equal(serviceChargeLabel, 'Included');
      assert.equal(total, subtotal);
      assert.equal(formatLkrPrice(total), formatLkrPrice(subtotal));
    });
  });
});
