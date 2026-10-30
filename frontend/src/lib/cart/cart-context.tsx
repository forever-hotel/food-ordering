'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CartItem, GuestMenuItem } from '../../types/menu.ts';

interface AddItemResult {
  success: boolean;
  reason?: string;
}

interface CartContextType {
  items: CartItem[];
  totalCount: number;
  totalAmount: number;
  addItem: (item: GuestMenuItem, quantity?: number, specialNotes?: string) => AddItemResult;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => boolean;
  clearCart: () => void;
  getItemQuantity: (itemId: string) => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

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
  }, []);

  const value = useMemo(
    () => ({
      items,
      totalCount,
      totalAmount,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getItemQuantity,
    }),
    [
      items,
      totalCount,
      totalAmount,
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
