'use client';

import React from 'react';
import { Button, Card, Input, Typography } from 'antd';
import type { CartItem } from '../../../types/menu.ts';
import { formatLkrPrice } from '../../../lib/api/menu.ts';
import { useCart } from '../../../lib/cart/cart-context.tsx';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

interface CartViewProps {
  onBack: () => void;
  onPlaceOrder?: () => void;
}

export function CartView({ onBack, onPlaceOrder }: CartViewProps) {
  const {
    items,
    allergyNote,
    setAllergyNote,
    updateQuantity,
    removeItem,
    totalCount,
    totalAmount,
  } = useCart();

  const handleIncrement = (cartItem: CartItem) => {
    const portionCap = cartItem.item.portionCap || 3;
    if (cartItem.quantity < portionCap) {
      updateQuantity(cartItem.id, cartItem.quantity + 1);
    }
  };

  const handleDecrement = (cartItem: CartItem) => {
    if (cartItem.quantity > 1) {
      updateQuantity(cartItem.id, cartItem.quantity - 1);
    } else {
      removeItem(cartItem.id);
    }
  };

  return (
    <div
      role="region"
      aria-label="Your Cart and Allergy Notes"
      className="w-full max-w-md mx-auto space-y-4 pb-36 animate-fade-in"
    >
      {/* Header back button (Figure 34: "← Your Cart / 2 items") */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          aria-label="Back to Menu"
          onClick={onBack}
          className="touch-target inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557] rounded-lg px-2 py-1"
        >
          <span aria-hidden="true" className="text-base font-bold">
            ←
          </span>
          <span>Back to Menu</span>
        </button>

        <span className="text-xs font-semibold text-slate-400">
          {totalCount} {totalCount === 1 ? 'item' : 'items'} in cart
        </span>
      </div>

      {/* Cart Items List */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs divide-y divide-slate-100 overflow-hidden"
        styles={{ body: { padding: '8px 16px' } }}
      >
        {items.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Your cart is empty. Please select food items from the menu.
          </div>
        ) : (
          items.map((cartItem) => {
            const portionCap = cartItem.item.portionCap || 3;

            return (
              <div key={cartItem.id} className="py-3.5 flex items-center justify-between gap-3">
                {/* Food Avatar / Thumbnail */}
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200/80 flex-shrink-0 flex items-center justify-center text-2xl select-none overflow-hidden">
                  {cartItem.item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cartItem.item.imageUrl}
                      alt={cartItem.item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>🍲</span>
                  )}
                </div>

                {/* Name & Unit Price */}
                <div className="flex-1 min-w-0">
                  <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-0.5 truncate">
                    {cartItem.item.name}
                  </Title>
                  <Text className="text-xs font-semibold text-slate-500 block">
                    {formatLkrPrice(cartItem.item.price)}
                  </Text>
                  {cartItem.specialNotes && (
                    <span className="text-[11px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-medium mt-1 inline-block truncate max-w-[180px]">
                      Note: {cartItem.specialNotes}
                    </span>
                  )}
                </div>

                {/* +/- Stepper Controls (Figure 34) */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1 flex-shrink-0">
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${cartItem.item.name}`}
                    onClick={() => handleDecrement(cartItem)}
                    className="touch-target w-8 h-8 rounded-xl bg-white text-slate-800 shadow-xs hover:bg-slate-100 active:scale-95 flex items-center justify-center font-bold text-base transition-all"
                  >
                    −
                  </button>

                  <span className="w-5 text-center text-sm font-bold text-slate-800 tabular-nums">
                    {cartItem.quantity}
                  </span>

                  <button
                    type="button"
                    aria-label={`Increase quantity of ${cartItem.item.name}`}
                    disabled={cartItem.quantity >= portionCap}
                    onClick={() => handleIncrement(cartItem)}
                    className={`touch-target w-8 h-8 rounded-xl flex items-center justify-center font-bold text-base transition-all ${
                      cartItem.quantity < portionCap
                        ? 'bg-white text-slate-800 shadow-xs hover:bg-slate-100 active:scale-95'
                        : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Subtotal row within cart card */}
        {items.length > 0 && (
          <div className="pt-3 pb-1 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Subtotal</span>
            <span className="text-sm text-[#1D3557]">{formatLkrPrice(totalAmount)}</span>
          </div>
        )}
      </Card>

      {/* ALLERGY INFO & DIETARY PREFERENCES (Figure 34) */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '18px 16px' } }}
      >
        <div className="flex items-center justify-between mb-2">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            ALLERGY INFO & DIETARY PREFERENCES
          </Text>
          <span
            className={`text-[11px] font-mono tabular-nums ${
              allergyNote.length >= 300 ? 'text-red-500 font-bold' : 'text-slate-400'
            }`}
          >
            {allergyNote.length}/300 characters
          </span>
        </div>

        <TextArea
          rows={3}
          value={allergyNote}
          onChange={(e) => setAllergyNote(e.target.value)}
          maxLength={300}
          placeholder="e.g. I am allergic to peanuts. Please avoid any cross-contamination..."
          className="!rounded-2xl text-xs !bg-slate-50 !border-slate-200 focus:!bg-white"
        />

        {/* High-visibility Kitchen Note Alert (Figure 34) */}
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-2">
          <span className="text-sm select-none" aria-hidden="true">
            ⚠️
          </span>
          <Paragraph className="!text-[11px] !text-amber-900 !mb-0 leading-relaxed font-medium">
            This message is highlighted on the kitchen order ticket and acknowledged before
            preparation.
          </Paragraph>
        </div>
      </Card>

      {/* Subtotal & Service Charge Calculation Card (Figure 34) */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '16px 18px' } }}
      >
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-700">{formatLkrPrice(totalAmount)}</span>
          </div>

          <div className="flex items-center justify-between text-slate-500">
            <span>Service charge</span>
            <span className="font-semibold text-emerald-600">Included</span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-[#1D3557]">
            <span className="text-base font-extrabold">Total</span>
            <span className="text-base font-extrabold">{formatLkrPrice(totalAmount)}</span>
          </div>
        </div>
      </Card>

      {/* Place Order CTA Sticky Footer (Figure 34) */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-4 py-3 pb-safe shadow-[0_-4px_14px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-md mx-auto space-y-2">
          <Button
            type="primary"
            block
            size="large"
            disabled={items.length === 0}
            onClick={onPlaceOrder}
            className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162a45] active:scale-[0.99] !font-bold text-sm shadow-md"
          >
            Place Order
          </Button>

          <Paragraph className="!text-[11px] !text-slate-400 text-center !mb-0">
            You can cancel within 10 minutes of placing
          </Paragraph>
        </div>
      </div>
    </div>
  );
}
