'use client';

import { useState } from 'react';
import { App, Button, Card, Input, Tag, Typography } from 'antd';
import type { GuestMenuItem } from '../../../types/menu.ts';
import { formatLkrPrice, isValidImageUrl } from '../../../lib/api/menu.ts';
import { calculateLineTotal } from '../../../lib/utils/money.ts';
import {
  MIN_ORDER_ITEM_QUANTITY,
  MAX_ORDER_ITEM_QUANTITY,
} from '../../../lib/constants/order-policy.ts';
import { useCart } from '../../../lib/cart/cart-context.tsx';
import type { ItemAvailabilityInfo } from '../../../lib/utils/meal-windows.ts';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

interface MenuItemDetailProps {
  item: GuestMenuItem;
  availability?: ItemAvailabilityInfo;
  onBack: () => void;
}

function formatDietaryTag(tag: string): string {
  const cleaned = tag.replace(/_/g, '-').toLowerCase();
  if (cleaned === 'gluten-free') return 'Gluten-free';
  if (cleaned === 'high-protein') return 'High protein';
  if (cleaned === 'dairy-free') return 'Dairy-free';
  if (cleaned === 'vegetarian') return 'Vegetarian';
  if (cleaned === 'vegan') return 'Vegan';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function MenuItemDetail({ item, availability, onBack }: MenuItemDetailProps) {
  const { message } = App.useApp();
  const { addItem, getItemQuantity } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [specialNotes, setSpecialNotes] = useState('');
  const [imgError, setImgError] = useState(false);

  const portionCap = item.portionCap ?? MAX_ORDER_ITEM_QUANTITY;
  const currentCartQty = getItemQuantity(item.id);
  const remainingAllowance = Math.max(0, portionCap - currentCartQty);

  const isSoldOut = !item.available || availability?.state === 'sold_out';
  const isActionable = availability
    ? availability.state === 'available'
    : item.available && item.isOrderable && !item.isCutoff;
  const canOrder = isActionable && remainingAllowance > 0;

  // Resolve visible button label guaranteeing meaningful text for every state
  const getCtaLabel = (): string => {
    if (!isActionable) {
      if (isSoldOut || availability?.state === 'sold_out') {
        return 'Sold Out';
      }
      if (availability?.state === 'not_yet_open') {
        return 'Ordering Not Yet Open';
      }
      if (availability?.state === 'closed' || item.isCutoff) {
        return 'Ordering Closed';
      }
      if (availability?.buttonLabel) {
        return availability.buttonLabel;
      }
      return 'Currently Unavailable';
    }

    if (remainingAllowance <= 0) {
      return 'Maximum Quantity Reached';
    }

    return 'Add to Cart';
  };

  const ctaLabel = getCtaLabel();

  const handleIncrement = () => {
    if (quantity < portionCap && quantity < remainingAllowance) {
      setQuantity((q) => q + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > MIN_ORDER_ITEM_QUANTITY) {
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

  const calculatedTotal = calculateLineTotal(item.price, quantity);
  const hasValidImage = isValidImageUrl(item.imageUrl) && !imgError;

  return (
    <div
      role="region"
      aria-label={`${item.name} details`}
      className="w-full max-w-md mx-auto space-y-4 pb-28 animate-fade-in"
    >
      {/* Hero Food Photography (Figure 33: KMS image_url or neutral placeholder) */}
      <div className="relative w-full h-64 rounded-[10px] overflow-hidden bg-slate-900 border border-[#ddd8cf] shadow-none flex items-center justify-center">
        {hasValidImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl!}
            alt={item.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-300 gap-2 select-none"
            role="img"
            aria-label={`${item.name} placeholder`}
          >
            <span className="text-5xl" aria-hidden="true">
              🍲
            </span>
            <span className="text-xs text-[#5a5650] font-medium tracking-wide">
              Forever Hotel Kitchen
            </span>
          </div>
        )}

        {/* Floating Back Button (Figure 33: "← Lunch") */}
        <button
          type="button"
          aria-label={`Go back to ${item.category} menu`}
          onClick={onBack}
          className="touch-target absolute top-4 left-4 z-10 bg-white/90 hover:bg-white active:scale-95 text-[#1a1a18] backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-none flex items-center gap-1.5 transition-all focus-visible:outline-2 focus-visible:outline-[#1a3c5e]"
        >
          <span aria-hidden="true">←</span>
          <span>{item.category}</span>
        </button>

        {isSoldOut ? (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-red-600 text-white font-semibold px-4 py-1.5 rounded-full text-xs uppercase tracking-wider shadow-none">
              Sold Out
            </span>
          </div>
        ) : !isActionable && availability?.badgeLabel ? (
          <div className="absolute top-4 right-4 z-10">
            <span className="bg-slate-900/80 backdrop-blur-md text-white font-semibold px-3 py-1.5 rounded-full text-xs shadow-none">
              {availability.badgeLabel}
            </span>
          </div>
        ) : null}
      </div>

      {/* Main Content Card */}
      <Card
        className="!rounded-[10px] !border-[#ddd8cf] !bg-white !shadow-none"
        styles={{ body: { padding: '20px 18px' } }}
      >
        {/* Title and Price */}
        <div className="mb-2">
          <Title level={2} className="!text-xl !font-semibold !text-[#1a1a18] !mb-1 leading-snug">
            {item.name}
          </Title>
          <div className="flex items-center justify-between">
            <Text strong className="text-lg font-semibold text-[#1a3c5e]">
              {formatLkrPrice(item.price)}
            </Text>
            {item.estimatedPrepMinutes > 0 && (
              <span className="text-xs text-[#5a5650] font-medium flex items-center gap-1">
                ⏱️ {item.estimatedPrepMinutes} mins prep
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {item.description && (
          <Paragraph className="!text-xs !text-[#5a5650] !mb-5 leading-relaxed">
            {item.description}
          </Paragraph>
        )}

        {/* ALLERGENS & DIETARY (Figure 33) */}
        <div className="mb-5">
          <Text className="text-xs font-semibold text-[#5a5650] uppercase tracking-wider block mb-2">
            ALLERGENS & DIETARY
          </Text>
          <div className="flex flex-wrap gap-1.5">
            {item.dietaryFlags.map((flag) => (
              <span
                key={flag}
                className="text-xs bg-[#e8eef4] text-[#1a1a18] px-2.5 py-1 rounded-lg font-medium"
              >
                {formatDietaryTag(flag)}
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
              <span className="text-xs text-[#5a5650]">
                Standard hotel preparation. Inform kitchen of specific allergies below.
              </span>
            )}
          </div>
        </div>

        {/* Portion Cap & Quantity Counter (Figure 33) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Text className="text-xs text-[#5a5650] font-medium">Max {portionCap} per order</Text>
            {remainingAllowance < portionCap && (
              <span className="text-[11px] text-amber-700 font-medium">
                ({currentCartQty} already in cart)
              </span>
            )}
          </div>

          <div className="flex items-center justify-between bg-[#f9f7f4] border border-[#ddd8cf] rounded-[10px] p-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= MIN_ORDER_ITEM_QUANTITY || !canOrder}
              onClick={handleDecrement}
              className={`touch-target w-10 h-10 rounded-[10px] flex items-center justify-center font-semibold text-lg transition-all ${
                quantity > MIN_ORDER_ITEM_QUANTITY && canOrder
                  ? 'bg-white text-[#1a1a18] shadow-none hover:bg-[#e8eef4] active:scale-95'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              −
            </button>

            <span className="text-base font-semibold text-[#1a1a18] tabular-nums">{quantity}</span>

            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= portionCap || quantity >= remainingAllowance || !canOrder}
              onClick={handleIncrement}
              className={`touch-target w-10 h-10 rounded-[10px] flex items-center justify-center font-semibold text-lg transition-all ${
                quantity < portionCap && quantity < remainingAllowance && canOrder
                  ? 'bg-white text-[#1a1a18] shadow-none hover:bg-[#e8eef4] active:scale-95'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              +
            </button>
          </div>
        </div>

        {/* Special Instructions (optional notes) */}
        <div className="mb-2">
          <Text className="text-xs font-semibold text-[#5a5650] uppercase tracking-wider block mb-1.5">
            SPECIAL INSTRUCTIONS (OPTIONAL)
          </Text>
          <TextArea
            rows={2}
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            placeholder="e.g. dressing on the side, extra crispy..."
            className="!rounded-[10px] text-xs !bg-[#f9f7f4] !border-[#ddd8cf]"
            maxLength={200}
          />
        </div>
      </Card>

      {/* Sticky Bottom Bar with Total & Add to Cart CTA (Figure 33) */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#ddd8cf] px-4 py-3 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-md mx-auto flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#5a5650] uppercase tracking-wider">
            Total
          </span>
          <span className="text-base font-semibold text-[#1a3c5e]">
            {formatLkrPrice(calculatedTotal)}
          </span>
        </div>

        <Button
          type="primary"
          block
          size="large"
          disabled={!canOrder}
          aria-disabled={!canOrder}
          onClick={handleAddToCart}
          className={`!h-12 !rounded-[10px] !font-semibold text-sm shadow-none transition-all ${
            canOrder
              ? '!bg-[#1a3c5e] hover:!bg-[#12263a] !text-white'
              : '!bg-slate-200 !text-[#5a5650] !border-[#ddd8cf] !cursor-not-allowed'
          }`}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
