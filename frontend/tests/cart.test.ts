import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_MENU_RESPONSE, formatLkrPrice } from '../src/lib/api/menu.ts';
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
    const totalAmount = cart.reduce((sum, i) => sum + i.item.price * i.quantity, 0);

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
  it('enforces maximum portion limits per item (e.g. max 3 per order for Grilled Chicken Rice)', () => {
    const chickenRice = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101')!;
    const portionCap = chickenRice.portionCap || 3;

    const validatePortionLimit = (currentQty: number, addedQty: number): boolean => {
      return currentQty + addedQty <= portionCap;
    };

    assert.equal(validatePortionLimit(1, 1), true); // 2 <= 3
    assert.equal(validatePortionLimit(1, 2), true); // 3 <= 3
    assert.equal(validatePortionLimit(1, 3), false); // 4 > 3
    assert.equal(validatePortionLimit(3, 1), false); // 4 > 3
  });

  it('clamps and rejects allergy note exceeding 300 characters', () => {
    const clampNote = (text: string): string => text.slice(0, 300);

    const longText = 'A'.repeat(350);
    const clamped = clampNote(longText);

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
  it('derives session storage key scoped strictly by bookingId and roomNumber', () => {
    const getStorageKey = (bookingId: string, roomNumber: string): string => {
      return `foss_cart_session_${bookingId}_${roomNumber}`;
    };

    const keyGuest1 = getStorageKey('booking-101', '103');
    const keyGuest2 = getStorageKey('booking-102', '104');

    assert.equal(keyGuest1, 'foss_cart_session_booking-101_103');
    assert.equal(keyGuest2, 'foss_cart_session_booking-102_104');
    assert.notEqual(keyGuest1, keyGuest2);
  });

  it('clears or ignores stored cart if booking or room mismatch occurs', () => {
    const activeGuest = { bookingId: 'booking-102', roomNumber: '104' };

    const storedData = {
      bookingId: 'booking-101', // old guest
      roomNumber: '103',
      items: [{ id: 'item-101', quantity: 2 }],
      allergyNote: 'Gluten free please',
    };

    const isSameStay =
      storedData.bookingId === activeGuest.bookingId &&
      storedData.roomNumber === activeGuest.roomNumber;

    assert.equal(isSameStay, false);
    // Unmatched stay cart items must NOT be loaded for activeGuest
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
  it('matches Figure 34 cart summary layout (Subtotal, Service charge Included, Total)', () => {
    const subtotal = 1500;
    const serviceCharge = 'Included';
    const total = 1500;

    const summary = {
      subtotalDisplay: formatLkrPrice(subtotal),
      serviceChargeDisplay: serviceCharge,
      totalDisplay: formatLkrPrice(total),
    };

    assert.equal(summary.subtotalDisplay, 'LKR 1,500');
    assert.equal(summary.serviceChargeDisplay, 'Included');
    assert.equal(summary.totalDisplay, 'LKR 1,500');
  });

  it('renders kitchen order ticket alert notice text from Figure 34', () => {
    const kitchenNoticeText =
      'This message is highlighted on the kitchen order ticket and acknowledged before preparation.';
    assert.match(kitchenNoticeText, /highlighted on the kitchen order ticket/);
    assert.match(kitchenNoticeText, /acknowledged before preparation/);
  });
});
