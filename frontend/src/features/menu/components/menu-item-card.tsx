'use client';

import React, { useState } from 'react';
import { Card, Tag, Typography } from 'antd';
import type { GuestMenuItem } from '../../../types/menu.ts';
import { formatLkrPrice, isValidImageUrl } from '../../../lib/api/menu.ts';

const { Title, Paragraph, Text } = Typography;

interface MenuItemCardProps {
  item: GuestMenuItem;
  onSelect: (item: GuestMenuItem) => void;
  onQuickAdd: (item: GuestMenuItem) => void;
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

export function MenuItemCard({ item, onSelect, onQuickAdd }: MenuItemCardProps) {
  const [imgError, setImgError] = useState(false);

  const isSoldOut = !item.available;
  const isCutoff = item.isCutoff || !item.isOrderable;
  const isActionable = item.available && item.isOrderable && !item.isCutoff;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isActionable) return;
    onQuickAdd(item);
  };

  const hasValidImage = isValidImageUrl(item.imageUrl) && !imgError;

  return (
    <Card
      role="button"
      tabIndex={0}
      data-testid="menu-item-card"
      aria-label={`${item.name}, ${formatLkrPrice(item.price)}. ${
        isSoldOut ? 'Sold out.' : isCutoff ? 'Outside ordering hours.' : 'Available to order.'
      } Click for details.`}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className={`!rounded-2xl !border-slate-100/90 !bg-white !shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
        isSoldOut || isCutoff
          ? 'opacity-60 hover:border-slate-100'
          : 'hover:border-slate-200 active:scale-[0.99]'
      }`}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div className="flex gap-3.5 items-center">
        {/* Food Thumbnail (KMS image_url or neutral placeholder) */}
        <div className="w-18 h-18 rounded-2xl bg-slate-100 border border-slate-200/80 flex-shrink-0 overflow-hidden relative shadow-2xs flex items-center justify-center">
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
              className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 select-none"
              role="img"
              aria-label={`${item.name} placeholder`}
            >
              <span className="text-2xl" aria-hidden="true">
                🍲
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <Title
              level={4}
              className="!text-sm !font-bold !text-[#1E293B] !mb-0 truncate leading-snug"
            >
              {item.name}
            </Title>

            {isSoldOut ? (
              <Tag color="default" className="text-[10px] font-semibold mr-0 !rounded-full">
                Unavailable
              </Tag>
            ) : isCutoff ? (
              <Tag
                color="default"
                className="text-[10px] font-semibold mr-0 text-slate-500 !rounded-full"
              >
                Outside Hours
              </Tag>
            ) : null}
          </div>

          {item.description && (
            <Paragraph
              ellipsis={{ rows: 2 }}
              className="!text-xs !text-slate-500 !mb-1.5 leading-relaxed"
            >
              {item.description}
            </Paragraph>
          )}

          {/* Dietary Flags & Allergen Badges (Figure 32) */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {item.dietaryFlags.map((flag) => (
              <span
                key={flag}
                className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium"
              >
                {formatDietaryTag(flag)}
              </span>
            ))}
            {item.allergens.map((allergen) => (
              <span
                key={allergen}
                className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5"
              >
                ⚠️ {allergen}
              </span>
            ))}
          </div>

          {/* Price and Add Button */}
          <div className="flex items-center justify-between pt-0.5">
            <Text strong className="text-sm font-bold text-[#1D3557]">
              {formatLkrPrice(item.price)}
            </Text>

            {isActionable ? (
              <button
                type="button"
                aria-label={`Add ${item.name} to order`}
                onClick={handleQuickAdd}
                className="touch-target w-8 h-8 rounded-full bg-[#F5A623] hover:bg-[#d99018] active:scale-95 text-white flex items-center justify-center font-bold text-lg shadow-xs transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557]"
              >
                +
              </button>
            ) : (
              <span className="text-xs text-slate-400 font-medium">
                {isSoldOut ? 'Unavailable' : 'Outside Hours'}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
