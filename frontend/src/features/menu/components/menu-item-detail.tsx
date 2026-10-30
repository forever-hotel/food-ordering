'use client';

import React, { useState } from 'react';
import { Button, Card, Input, message, Tag, Typography } from 'antd';
import type { GuestMenuItem } from '../../../types/menu.ts';
import { formatLkrPrice } from '../../../lib/api/menu.ts';
import { useCart } from '../../../lib/cart/cart-context.tsx';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

interface MenuItemDetailProps {
  item: GuestMenuItem;
  onBack: () => void;
}

export function MenuItemDetail({ item, onBack }: MenuItemDetailProps) {
  const { addItem, getItemQuantity } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [specialNotes, setSpecialNotes] = useState('');
  const [imgError, setImgError] = useState(false);

  const portionCap = item.portionCap || 3;
  const currentCartQty = getItemQuantity(item.id);
  const remainingAllowance = Math.max(0, portionCap - currentCartQty);

  const isSoldOut = !item.available;
  const isCutoff = item.isCutoff || !item.isOrderable;
  const canOrder = item.available && item.isOrderable && !item.isCutoff && remainingAllowance > 0;

  const handleIncrement = () => {
    if (quantity < portionCap && quantity < remainingAllowance) {
      setQuantity((q) => q + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity((q) => q - 1);
    }
  };

  const handleAddToCart = () => {
    if (!canOrder) return;

    const result = addItem(item, quantity, specialNotes.trim() || undefined);
    if (result.success) {
      message.success(`Added ${quantity} × ${item.name} to order.`);
      onBack();
    } else {
      message.error(result.reason || 'Failed to add item.');
    }
  };

  const calculatedTotal = item.price * quantity;

  return (
    <div
      role="region"
      aria-label={`${item.name} details`}
      className="w-full max-w-md mx-auto space-y-4 pb-28 animate-fade-in"
    >
      {/* Hero Food Photography (Figure 33) */}
      <div className="relative w-full h-56 rounded-3xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
        {item.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white gap-2">
            <span className="text-5xl" aria-hidden="true">
              🍲
            </span>
            <span className="text-xs text-slate-300 font-medium">Forever Hotel Kitchen</span>
          </div>
        )}

        {/* Floating Back Button (Figure 33: "← Lunch") */}
        <button
          type="button"
          aria-label={`Go back to ${item.category} menu`}
          onClick={onBack}
          className="touch-target absolute top-4 left-4 z-10 bg-white/90 hover:bg-white active:scale-95 text-slate-800 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557]"
        >
          <span aria-hidden="true">←</span>
          <span>{item.category}</span>
        </button>

        {isSoldOut && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-red-600 text-white font-bold px-4 py-1.5 rounded-full text-xs uppercase tracking-wider shadow-lg">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Main Content Card */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '20px 18px' } }}
      >
        {/* Title and Price */}
        <div className="mb-2">
          <Title level={2} className="!text-xl !font-bold !text-[#1E293B] !mb-1 leading-snug">
            {item.name}
          </Title>
          <div className="flex items-center justify-between">
            <Text strong className="text-lg font-bold text-[#1D3557]">
              {formatLkrPrice(item.price)}
            </Text>
            {item.estimatedPrepMinutes > 0 && (
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                ⏱️ {item.estimatedPrepMinutes} mins prep
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {item.description && (
          <Paragraph className="!text-xs !text-slate-600 !mb-5 leading-relaxed">
            {item.description}
          </Paragraph>
        )}

        {/* ALLERGENS & DIETARY (Figure 33) */}
        <div className="mb-5">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            ALLERGENS & DIETARY
          </Text>
          <div className="flex flex-wrap gap-1.5">
            {item.dietaryFlags.map((flag) => (
              <span
                key={flag}
                className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium"
              >
                {flag}
              </span>
            ))}
            {item.allergens.map((allergen) => (
              <Tag
                key={allergen}
                color="warning"
                className="font-medium text-xs !px-2.5 !py-0.5 rounded-lg mr-0"
              >
                ⚠️ {allergen}
              </Tag>
            ))}
            {item.dietaryFlags.length === 0 && item.allergens.length === 0 && (
              <span className="text-xs text-slate-400">
                Standard hotel preparation. Inform kitchen of specific allergies below.
              </span>
            )}
          </div>
        </div>

        {/* NUTRITION PER SERVING (Figure 33) */}
        {item.nutrition && (
          <div className="mb-5">
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              NUTRITION PER SERVING
            </Text>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 text-center">
                <span className="block text-base font-bold text-[#1D3557] leading-none mb-1">
                  {item.nutrition.calories}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  CALORIES
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 text-center">
                <span className="block text-base font-bold text-[#1D3557] leading-none mb-1">
                  {item.nutrition.proteinGrams}g
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  PROTEIN
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 text-center">
                <span className="block text-base font-bold text-[#1D3557] leading-none mb-1">
                  {item.nutrition.fatGrams}g
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  FAT
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Portion Cap & Quantity Counter (Figure 33) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Text className="text-xs text-slate-500 font-medium">Max {portionCap} per order</Text>
            {remainingAllowance < portionCap && (
              <span className="text-[11px] text-amber-700 font-medium">
                ({currentCartQty} already in cart)
              </span>
            )}
          </div>

          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= 1 || !canOrder}
              onClick={handleDecrement}
              className={`touch-target w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${
                quantity > 1 && canOrder
                  ? 'bg-white text-slate-800 shadow-xs hover:bg-slate-100 active:scale-95'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              −
            </button>

            <span className="text-base font-bold text-slate-800 tabular-nums">{quantity}</span>

            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= portionCap || quantity >= remainingAllowance || !canOrder}
              onClick={handleIncrement}
              className={`touch-target w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${
                quantity < portionCap && quantity < remainingAllowance && canOrder
                  ? 'bg-white text-slate-800 shadow-xs hover:bg-slate-100 active:scale-95'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              +
            </button>
          </div>
        </div>

        {/* Special Instructions (optional notes) */}
        <div className="mb-2">
          <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
            SPECIAL INSTRUCTIONS (OPTIONAL)
          </Text>
          <TextArea
            rows={2}
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            placeholder="e.g. dressing on the side, extra crispy..."
            className="!rounded-xl text-xs !bg-slate-50 !border-slate-200"
            maxLength={200}
          />
        </div>
      </Card>

      {/* Sticky Bottom Bar with Total & Add to Cart CTA (Figure 33) */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-4 py-3 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-md mx-auto flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total
          </span>
          <span className="text-base font-bold text-[#1D3557]">
            {formatLkrPrice(calculatedTotal)}
          </span>
        </div>

        <Button
          type="primary"
          block
          size="large"
          disabled={!canOrder}
          onClick={handleAddToCart}
          className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162a45] !font-bold text-sm shadow-md"
        >
          {isSoldOut
            ? 'Item Sold Out'
            : isCutoff
              ? 'Cutoff Passed'
              : remainingAllowance <= 0
                ? 'Max Portion in Cart'
                : 'Add to Cart'}
        </Button>
      </div>
    </div>
  );
}
