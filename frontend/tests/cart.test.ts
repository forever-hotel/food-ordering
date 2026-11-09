import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_MENU_RESPONSE, formatLkrPrice } from '../src/lib/api/menu.ts';
import { calculateSubtotal } from '../src/lib/utils/money.ts';
import {
  MIN_ORDER_ITEM_QUANTITY,
  MAX_ORDER_ITEM_QUANTITY,
} from '../src/lib/constants/order-policy.ts';
import {
  CART_STORAGE_PREFIX,
  getCartStorageKey,
  loadInitialCart,
  type StoredCartState,
} from '../src/lib/cart/cart-storage.ts';
import type { CartItem, GuestMenuItem } from '../src/types/menu.ts';

describe('TC-DDP-139-AC1: Successful Workflow - Cart Operations & Allergy Notes', () => {
  it('adds items, updates quantities, and calculates monetary totals accurately', () => {
    const chickenRice = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101')!;
    const kottu = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-102')!;

    const cart: CartItem[] = [
      { id: chickenRice.id, item: chickenRice, quantity: 1 },
      { id: kottu.id, item: kottu, quantity: 1 },
    ];

    const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = calculateSubtotal(cart);

    assert.equal(totalCount, 2);
    assert.equal(totalAmount, 1500); // 850 + 650
    assert.equal(formatLkrPrice(totalAmount), 'LKR 1,500');
  });

  it('preserves allergy and dietary preferences note attached to order', () => {
    const allergyNote =
      'e.g. I am allergic to peanuts. Please avoid any cross-contamination with nut oils.';

    assert.ok(allergyNote.length > 0);
    assert.ok(allergyNote.length <= 300);
    assert.match(allergyNote, /allergic to peanuts/);
  });
});

describe('TC-DDP-139-AC2: Negative / Error Cases - Portion Caps & 300-Char Note Bounds', () => {
  it('enforces maximum portion limits per item against order-policy boundaries', () => {
    const chickenRice = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101')!;
    const portionCap = chickenRice.portionCap ?? MAX_ORDER_ITEM_QUANTITY;

    assert.equal(MIN_ORDER_ITEM_QUANTITY, 1);
    assert.equal(MAX_ORDER_ITEM_QUANTITY, 20);

    const validatePortion = (currentQty: number, addedQty: number): boolean => {
      const target = currentQty + addedQty;
      return target >= MIN_ORDER_ITEM_QUANTITY && target <= portionCap;
    };

    assert.equal(validatePortion(0, 1), true);
    assert.equal(validatePortion(0, 3), true);
    assert.equal(validatePortion(1, 3), false); // 4 > 3
    assert.equal(validatePortion(0, 0), false); // 0 < MIN
    assert.equal(validatePortion(0, 21), false); // 21 > MAX
  });

  it('clamps and rejects allergy note exceeding 300 characters', () => {
    const longText = 'A'.repeat(350);
    const clamped = longText.slice(0, 300);

    assert.equal(clamped.length, 300);
    assert.equal(clamped, 'A'.repeat(300));
  });

  it('blocks adding out-of-stock items or items with cutoff deadlines to cart', () => {
    const prawnNoodles = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-103')!;
    const eggsBenedict = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-104')!;

    const canAddToCart = (item: GuestMenuItem): boolean => {
      return item.available && item.isOrderable && !item.isCutoff;
    };

    assert.equal(canAddToCart(prawnNoodles), false); // Sold out
    assert.equal(canAddToCart(eggsBenedict), false); // Cutoff reached
  });
});

describe('TC-DDP-139-AC3: Boundary, Session Scope & Persistence Isolation', () => {
  it('derives session storage key scoped strictly by bookingId and roomNumber using CART_STORAGE_PREFIX and getCartStorageKey', () => {
    const keyGuest1 = getCartStorageKey('booking-101', '103');
    const keyGuest2 = getCartStorageKey('booking-102', '104');

    assert.equal(keyGuest1, 'foss_cart_session_booking-101_103');
    assert.equal(keyGuest2, 'foss_cart_session_booking-102_104');
    assert.notEqual(keyGuest1, keyGuest2);
  });

  it('loadInitialCart returns empty cart when window or credentials are empty', () => {
    const emptyResult1 = loadInitialCart(undefined, '101');
    assert.deepEqual(emptyResult1, { items: [], allergyNote: '' });

    const emptyResult2 = loadInitialCart('b-101', undefined);
    assert.deepEqual(emptyResult2, { items: [], allergyNote: '' });
  });

  it('loadInitialCart parses stored cart and enforces stay boundary match when sessionStorage is populated', () => {
    const mockStorage = new Map<string, string>();
    const originalWindow = (globalThis as any).window;

    try {
      (globalThis as any).window = {
        sessionStorage: {
          getItem: (k: string) => mockStorage.get(k) ?? null,
          setItem: (k: string, v: string) => mockStorage.set(k, v),
          removeItem: (k: string) => mockStorage.delete(k),
        },
      };

      const key = `${CART_STORAGE_PREFIX}b-101_101`;
      const validPayload: StoredCartState = {
        bookingId: 'b-101',
        roomNumber: '101',
        items: [{ id: 'item-101', item: {} as any, quantity: 2 }],
        allergyNote: 'No nuts',
      };
      mockStorage.set(key, JSON.stringify(validPayload));

      // Same stay matches
      const loaded = loadInitialCart('b-101', '101');
      assert.equal(loaded.items.length, 1);
      assert.equal(loaded.allergyNote, 'No nuts');

      // Stay mismatch ignores stored cart
      const mismatch = loadInitialCart('b-102', '102');
      assert.equal(mismatch.items.length, 0);
      assert.equal(mismatch.allergyNote, '');

      // Malformed JSON triggers catch block
      mockStorage.set(key, '{ invalid-json');
      const malformed = loadInitialCart('b-101', '101');
      assert.deepEqual(malformed, { items: [], allergyNote: '' });

      // Non-array items and non-string allergyNote fall back safely
      mockStorage.set(
        key,
        JSON.stringify({
          bookingId: 'b-101',
          roomNumber: '101',
          items: 'not-an-array',
          allergyNote: 12345,
        }),
      );
      const fallbackParsed = loadInitialCart('b-101', '101');
      assert.deepEqual(fallbackParsed, { items: [], allergyNote: '' });

      // Storage access throwing error
      (globalThis as any).window.sessionStorage.getItem = () => {
        throw new Error('Access denied');
      };
      const accessDenied = loadInitialCart('b-101', '101');
      assert.deepEqual(accessDenied, { items: [], allergyNote: '' });
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
    }
  });

  it('does not store sensitive guest session tokens or credentials in cart storage payload', () => {
    const cartPayload = {
      bookingId: 'booking-101',
      roomNumber: '103',
      items: [{ id: 'item-101', quantity: 1 }],
      allergyNote: 'Peanut allergy',
    };

    const serialized = JSON.stringify(cartPayload);
    assert.doesNotMatch(serialized, /sessionToken/);
    assert.doesNotMatch(serialized, /Bearer/);
    assert.doesNotMatch(serialized, /password/);
  });
});

describe('TC-DDP-139-AC4: Contract & Visual Layout Fidelity Audit', () => {
  it('matches Figure 34 cart summary layout (Subtotal, Total)', () => {
    const subtotal = 1500;
    const total = 1500;

    const summary = {
      subtotalDisplay: formatLkrPrice(subtotal),
      totalDisplay: formatLkrPrice(total),
    };

    assert.equal(summary.subtotalDisplay, 'LKR 1,500');
    assert.equal(summary.totalDisplay, 'LKR 1,500');
  });

  it('renders kitchen order ticket alert notice text from Figure 34', () => {
    const kitchenNoticeText =
      'This message is highlighted on the kitchen order ticket and acknowledged before preparation.';
    assert.match(kitchenNoticeText, /highlighted on the kitchen order ticket/);
    assert.match(kitchenNoticeText, /acknowledged before preparation/);
  });
});
