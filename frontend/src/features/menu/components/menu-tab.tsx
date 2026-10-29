'use client';

import React, { useState } from 'react';
import { Alert, Badge, Button, Card, Tag, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'tea';
  tags: string[];
  warning?: string;
  available: boolean;
}

const SAMPLE_ITEMS: MenuItem[] = [
  {
    id: 'item-1',
    name: 'Grilled Chicken Rice',
    description: 'Char-grilled chicken, jasmine rice, house salad with lemon dressing',
    price: 850,
    category: 'lunch',
    tags: ['Gluten-free', 'High protein'],
    available: true,
  },
  {
    id: 'item-2',
    name: 'Vegetable Kottu',
    description: 'Shredded roti, mixed vegetables, farm egg, aromatic spices',
    price: 650,
    category: 'lunch',
    tags: ['Vegan option'],
    warning: 'Gluten',
    available: true,
  },
  {
    id: 'item-3',
    name: 'Prawn Noodles',
    description: 'Egg noodles, wok-seared tiger prawns, spring onion, shellfish broth',
    price: 950,
    category: 'lunch',
    tags: ['Shellfish'],
    available: false,
  },
];

export function MenuTab() {
  const [selectedCategory, setSelectedCategory] = useState<
    'breakfast' | 'lunch' | 'dinner' | 'tea'
  >('lunch');
  const [cartCount, setCartCount] = useState(2);
  const [cartTotal, setCartTotal] = useState(1500);

  const handleAddItem = (item: MenuItem) => {
    if (!item.available) return;
    setCartCount((c) => c + 1);
    setCartTotal((t) => t + item.price);
  };

  const categories = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'dinner', label: 'Dinner' },
    { key: 'tea', label: 'Tea & Snacks' },
  ];

  const displayedItems = SAMPLE_ITEMS.filter((item) => item.category === selectedCategory);

  return (
    <div
      role="tabpanel"
      id="tabpanel-menu"
      aria-labelledby="nav-tab-menu"
      className="w-full space-y-3 pb-20"
    >
      {/* Category Pills Header */}
      <div
        role="tablist"
        aria-label="Meal periods"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
      >
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() =>
                setSelectedCategory(cat.key as 'breakfast' | 'lunch' | 'dinner' | 'tea')
              }

              className={`touch-target px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
                isSelected
                  ? 'bg-[#1D3557] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Meal Period Cutoff Banner (Figure 32) */}
      <Alert
        type="warning"
        showIcon
        message={
          <span className="text-xs font-medium text-amber-900">
            Lunch orders close at <strong className="font-bold">14:30</strong> — 2h 16m left
          </span>
        }
        className="!rounded-xl !border-amber-200 !bg-amber-50 shadow-xs"
      />

      {/* Items List */}
      <div className="space-y-3">
        {displayedItems.map((item) => (
          <Card
            key={item.id}
            className={`!rounded-2xl !border-slate-100 !bg-white !shadow-xs overflow-hidden transition-all ${
              !item.available ? 'opacity-60' : 'hover:border-slate-200'
            }`}
            styles={{ body: { padding: '14px' } }}
          >
            <div className="flex gap-3">
              {/* Item Avatar Graphic */}
              <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center text-2xl select-none">
                🍲
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-0.5 truncate">
                    {item.name}
                  </Title>
                  {!item.available && (
                    <Tag color="default" className="text-[10px] font-medium mr-0">
                      Unavailable
                    </Tag>
                  )}
                </div>

                <Paragraph
                  ellipsis={{ rows: 2 }}
                  className="!text-xs !text-slate-500 !mb-2 leading-relaxed"
                >
                  {item.description}
                </Paragraph>

                {/* Dietary Tags & Warning */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium"
                    >
                      {t}
                    </span>
                  ))}
                  {item.warning && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                      ⚠️ {item.warning}
                    </span>
                  )}
                </div>

                {/* Price and Add CTA */}
                <div className="flex items-center justify-between pt-1">
                  <Text strong className="text-sm font-bold text-[#1D3557]">
                    LKR {item.price.toLocaleString()}
                  </Text>

                  {item.available ? (
                    <button
                      type="button"
                      aria-label={`Add ${item.name} to cart`}
                      onClick={() => handleAddItem(item)}
                      className="touch-target w-8 h-8 rounded-full bg-[#F5A623] hover:bg-[#d99018] text-white flex items-center justify-center font-bold text-base shadow-xs active:scale-95 transition-all"
                    >
                      +
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Sold Out</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Floating Cart CTA (Figure 32) */}
      {cartCount > 0 && (
        <div className="sticky bottom-20 z-30 pt-2">
          <Button
            type="primary"
            block
            size="large"
            className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162a45] !font-bold text-sm shadow-md flex items-center justify-between px-5"
          >
            <div className="flex items-center gap-2">
              <Badge count={cartCount} style={{ backgroundColor: '#F5A623' }} />
              <span>View Cart</span>
            </div>
            <span>LKR {cartTotal.toLocaleString()}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
