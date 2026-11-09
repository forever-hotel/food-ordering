import type { CartItem } from '../../types/menu.ts';

export const CART_STORAGE_PREFIX = 'foss_cart_session_';

export interface StoredCartState {
  bookingId: string;
  roomNumber: string;
  items: CartItem[];
  allergyNote: string;
}

export function getCartStorageKey(bookingId: string, roomNumber: string): string {
  return `${CART_STORAGE_PREFIX}${bookingId}_${roomNumber}`;
}

export function loadInitialCart(
  bookingId?: string,
  roomNumber?: string,
): {
  items: CartItem[];
  allergyNote: string;
} {
  if (typeof window === 'undefined' || !bookingId || !roomNumber) {
    return { items: [], allergyNote: '' };
  }

  try {
    const key = getCartStorageKey(bookingId, roomNumber);
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const parsed: StoredCartState = JSON.parse(raw);
      if (parsed.bookingId === bookingId && parsed.roomNumber === roomNumber) {
        return {
          items: Array.isArray(parsed.items) ? parsed.items : [],
          allergyNote:
            typeof parsed.allergyNote === 'string' ? parsed.allergyNote.slice(0, 300) : '',
        };
      }
    }
  } catch {
    // sessionStorage unavailable
  }
  return { items: [], allergyNote: '' };
}
