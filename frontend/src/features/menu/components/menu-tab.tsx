'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, message } from 'antd';
import type { GuestMenuItem, GuestMenuResponse } from '../../../types/menu.ts';
import { fetchGuestMenu, formatLkrPrice } from '../../../lib/api/menu.ts';
import { useAuth } from '../../../lib/auth/auth-context.tsx';
import { useNavigation } from '../../../lib/navigation/navigation-context.tsx';
import { useCart } from '../../../lib/cart/cart-context.tsx';
import { LoadingSkeleton } from '../../../components/feedback/loading-skeleton.tsx';
import { AlertNotice } from '../../../components/feedback/alert-notice.tsx';
import { EmptyState } from '../../../components/feedback/empty-state.tsx';
import { MenuItemCard } from './menu-item-card.tsx';
import { MenuItemDetail } from './menu-item-detail.tsx';
import { CartView } from '../../cart/components/cart-view.tsx';

type CategoryKey = 'Breakfast' | 'Lunch' | 'Dinner' | 'Tea';

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'Breakfast', label: 'Breakfast' },
  { key: 'Lunch', label: 'Lunch' },
  { key: 'Dinner', label: 'Dinner' },
  { key: 'Tea', label: 'Tea' },
];

export function MenuTab() {
  const { sessionToken, guest } = useAuth();
  const { setPageHeader, resetHeaderForTab } = useNavigation();
  const { totalCount, totalAmount, addItem, isCartOpen, setIsCartOpen } = useCart();

  const [catalog, setCatalog] = useState<GuestMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('Lunch');
  const [selectedItem, setSelectedItem] = useState<GuestMenuItem | null>(null);

  useEffect(() => {
    let isCancelled = false;

    fetchGuestMenu(sessionToken || 'demo-token')
      .then((data) => {
        if (!isCancelled) {
          setCatalog(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Unable to load menu. Please check your connection.';
          setError(errorMessage);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchGuestMenu(sessionToken || 'demo-token')
      .then((data) => {
        setCatalog(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const errorMessage =
          err instanceof Error ? err.message : 'Unable to load menu. Please check your connection.';
        setError(errorMessage);
        setLoading(false);
      });
  };

  const handleSelectItem = (item: GuestMenuItem) => {
    setSelectedItem(item);
    setPageHeader({
      title: item.name,
      subtitle: `${item.category} · Room ${guest?.roomNumber || '103'}`,
      showBackButton: true,
      onBack: () => {
        setSelectedItem(null);
        resetHeaderForTab('menu', guest?.roomNumber, guest?.guestName);
      },
    });
  };

  const handleBackToMenu = () => {
    setSelectedItem(null);
    setIsCartOpen(false);
    resetHeaderForTab('menu', guest?.roomNumber, guest?.guestName);
  };

  const handleOpenCart = () => {
    setIsCartOpen(true);
    setSelectedItem(null);
    setPageHeader({
      title: 'Your Cart',
      subtitle: `${totalCount} ${totalCount === 1 ? 'item' : 'items'} · Room ${
        guest?.roomNumber || '103'
      }`,
      showBackButton: true,
      onBack: handleBackToMenu,
    });
  };

  const handleQuickAdd = (item: GuestMenuItem) => {
    const result = addItem(item, 1);
    if (result.success) {
      message.success(`Added ${item.name} to order.`);
    } else {
      message.error(result.reason || 'Cannot add item.');
    }
  };

  // If viewing cart screen (Figure 34 & Figure 35 Confirmation)
  if (isCartOpen) {
    return (
      <CartView
        onBack={handleBackToMenu}
        onPlaceOrder={(order) => {
          setPageHeader({
            title: 'Order Confirmed',
            subtitle: `Order #${order.orderId} · Room ${order.roomNumber || guest?.roomNumber || '103'}`,
            showBackButton: false,
          });
        }}
      />
    );
  }

  // If viewing item detail screen (Figure 33)
  if (selectedItem) {
    return <MenuItemDetail item={selectedItem} onBack={handleBackToMenu} />;
  }

  // Active meal window banner calculation (Figure 32)
  const activeWindow = catalog?.mealWindows.find((w) => w.isActive) || catalog?.mealWindows[1];
  const cutoffTimeDisplay = activeWindow ? activeWindow.cutoffTime.slice(0, 5) : '14:30';
  const remainingMinutes = activeWindow ? Math.floor(activeWindow.secondsRemaining / 60) : 136;
  const hoursLeft = Math.floor(remainingMinutes / 60);
  const minsLeft = remainingMinutes % 60;
  const timeLeftDisplay =
    remainingMinutes > 0
      ? `${hoursLeft > 0 ? `${hoursLeft}h ` : ''}${minsLeft}m left`
      : 'Cutoff reached';

  const displayedItems = (catalog?.items || []).filter((item) => {
    if (selectedCategory === 'Tea') {
      return (
        item.category.toLowerCase().includes('tea') ||
        item.category.toLowerCase().includes('beverage')
      );
    }
    return item.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  return (
    <div
      role="tabpanel"
      id="tabpanel-menu"
      aria-labelledby="nav-tab-menu"
      className="w-full space-y-3.5 pb-24"
    >
      {/* Category Pills Header (Figure 32) */}
      <div
        role="tablist"
        aria-label="Meal periods"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none"
      >
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedCategory(cat.key)}
              className={`touch-target px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
                isSelected
                  ? 'bg-[#1D3557] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-95'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Meal Period Cutoff Banner (Figure 32: "Lunch orders close at 14:30 — 2h 16m left") */}
      <Alert
        type="warning"
        showIcon
        message={
          <span className="text-xs font-medium text-amber-950">
            {selectedCategory} orders close at{' '}
            <strong className="font-bold">{cutoffTimeDisplay}</strong> — {timeLeftDisplay}
          </span>
        }
        className="!rounded-xl !border-amber-200 !bg-amber-50 shadow-xs"
      />

      {/* Error state with retry */}
      {error && (
        <AlertNotice
          type="error"
          title="Unable to load menu"
          message={error}
          onRetry={handleRetry}
          className="mb-2"
        />
      )}

      {/* Loading Skeletons */}
      {loading && !catalog && <LoadingSkeleton count={3} type="card" />}

      {/* Items List */}
      {!loading && displayedItems.length > 0 && (
        <div className="space-y-3" role="feed" aria-label={`${selectedCategory} menu items`}>
          {displayedItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              onSelect={handleSelectItem}
              onQuickAdd={handleQuickAdd}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && displayedItems.length === 0 && !error && (
        <EmptyState
          icon="🍽️"
          title={`No ${selectedCategory} items available`}
          description="The kitchen does not currently have items in this category. Please check other meal periods."
          actionText="View Lunch Menu"
          onAction={() => setSelectedCategory('Lunch')}
        />
      )}

      {/* Floating View Cart CTA (Figure 32: "View Cart · 2 items · LKR 1,500") */}
      {totalCount > 0 && (
        <div className="fixed bottom-16 inset-x-0 z-30 px-4 py-2 flex justify-center pointer-events-none">
          <div className="w-full max-w-md pointer-events-auto">
            <Button
              type="primary"
              block
              size="large"
              aria-label={`View Cart with ${totalCount} items, total ${formatLkrPrice(totalAmount)}`}
              onClick={handleOpenCart}
              className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162A45] active:scale-[0.99] !font-bold text-sm shadow-lg flex items-center justify-between px-5 transition-transform"
            >
              <div className="flex items-center gap-2">
                <Badge count={totalCount} style={{ backgroundColor: '#F5A623' }} />
                <span>View Cart</span>
              </div>
              <span>
                {totalCount} {totalCount === 1 ? 'item' : 'items'} · {formatLkrPrice(totalAmount)}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
