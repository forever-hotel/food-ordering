'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, GuestMenuItem } from '../../types/menu.ts';
import { useAuth } from '../auth/auth-context.tsx';

interface AddItemResult {
  success: boolean;
  reason?: string;
}

interface CartContextType {
  items: CartItem[];
  allergyNote: string;
  totalCount: number;
  totalAmount: number;
  isCartOpen: boolean;
  setAllergyNote: (note: string) => void;
  setIsCartOpen: (open: boolean) => void;
  addItem: (item: GuestMenuItem, quantity?: number, specialNotes?: string) => AddItemResult;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => boolean;
  clearCart: () => void;
  getItemQuantity: (itemId: string) => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_PREFIX = 'foss_cart_session_';

interface StoredCartState {
  bookingId: string;
  roomNumber: string;
  items: CartItem[];
  allergyNote: string;
}

function loadInitialCart(
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
    const key = `${CART_STORAGE_PREFIX}${bookingId}_${roomNumber}`;
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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { guest, sessionToken } = useAuth();

  const [items, setItems] = useState<CartItem[]>(
    () => loadInitialCart(guest?.bookingId, guest?.roomNumber).items,
  );
  const [allergyNote, setAllergyNoteState] = useState<string>(
    () => loadInitialCart(guest?.bookingId, guest?.roomNumber).allergyNote,
  );
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Derive active session storage key bound to room & booking
  const storageKey = useMemo(() => {
    if (guest?.bookingId && guest?.roomNumber) {
      return `${CART_STORAGE_PREFIX}${guest.bookingId}_${guest.roomNumber}`;
    }
    return null;
  }, [guest?.bookingId, guest?.roomNumber]);

  // Handle stay changes or logout asynchronously
  useEffect(() => {
    if (!storageKey || !sessionToken) {
      Promise.resolve().then(() => {
        setItems([]);
        setAllergyNoteState('');
      });
      return;
    }

    const loaded = loadInitialCart(guest?.bookingId, guest?.roomNumber);
    Promise.resolve().then(() => {
      setItems(loaded.items);
      setAllergyNoteState(loaded.allergyNote);
    });
  }, [storageKey, sessionToken, guest?.bookingId, guest?.roomNumber]);

  // Persist cart to browser sessionStorage on state changes
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;

    try {
      const payload: StoredCartState = {
        bookingId: guest?.bookingId || '',
        roomNumber: guest?.roomNumber || '',
        items,
        allergyNote: allergyNote.slice(0, 300),
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // sessionStorage full or unavailable
    }
  }, [items, allergyNote, storageKey, guest?.bookingId, guest?.roomNumber]);

  const setAllergyNote = useCallback((note: string) => {
    // Enforce 300-character maximum per AC2
    setAllergyNoteState(note.slice(0, 300));
  }, []);

  const totalCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.item.price * item.quantity, 0),
    [items],
  );

  const getItemQuantity = useCallback(
    (itemId: string): number => {
      const existing = items.find((i) => i.id === itemId);
      return existing ? existing.quantity : 0;
    },
    [items],
  );

  const addItem = useCallback(
    (item: GuestMenuItem, quantity = 1, specialNotes?: string): AddItemResult => {
      // 1. Stock availability validation
      if (!item.available) {
        return {
          success: false,
          reason: `${item.name} is currently sold out and cannot be added.`,
        };
      }

      // 2. Ordering window cutoff validation
      if (!item.isOrderable || item.isCutoff) {
        return {
          success: false,
          reason: `Ordering cutoff for ${item.category} has passed. This item cannot be ordered now.`,
        };
      }

      const portionCap = item.portionCap || 3;
      const currentQty = getItemQuantity(item.id);

      if (currentQty + quantity > portionCap) {
        return {
          success: false,
          reason: `Maximum portion limit reached (max ${portionCap} per order for ${item.name}).`,
        };
      }

      setItems((prevItems) => {
        const index = prevItems.findIndex((i) => i.id === item.id);
        if (index > -1) {
          const updated = [...prevItems];
          updated[index] = {
            ...updated[index],
            quantity: updated[index].quantity + quantity,
            specialNotes: specialNotes ?? updated[index].specialNotes,
          };
          return updated;
        }
        return [...prevItems, { id: item.id, item, quantity, specialNotes }];
      });

      return { success: true };
    },
    [getItemQuantity],
  );

  const removeItem = useCallback((itemId: string) => {
    setItems((prevItems) => prevItems.filter((i) => i.id !== itemId));
  }, []);

  const updateQuantity = useCallback(
    (itemId: string, quantity: number): boolean => {
      if (quantity <= 0) {
        removeItem(itemId);
        return true;
      }

      const existing = items.find((i) => i.id === itemId);
      if (!existing) return false;

      const portionCap = existing.item.portionCap || 3;
      if (quantity > portionCap) {
        return false;
      }

      setItems((prevItems) => prevItems.map((i) => (i.id === itemId ? { ...i, quantity } : i)));
      return true;
    },
    [items, removeItem],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setAllergyNoteState('');
    if (typeof window !== 'undefined' && storageKey) {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const value = useMemo(
    () => ({
      items,
      allergyNote,
      totalCount,
      totalAmount,
      isCartOpen,
      setAllergyNote,
      setIsCartOpen,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getItemQuantity,
    }),
    [
      items,
      allergyNote,
      totalCount,
      totalAmount,
      isCartOpen,
      setAllergyNote,
      setIsCartOpen,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getItemQuantity,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
