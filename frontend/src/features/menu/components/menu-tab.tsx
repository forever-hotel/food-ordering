'use client';

import React, { useEffect, useState } from 'react';
import { App, Button } from 'antd';
import type { GuestMenuItem, GuestMenuResponse, MealPeriod } from '../../../types/menu.ts';
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
  const { message } = App.useApp();
  const { sessionToken, guest } = useAuth();
  const { setPageHeader, resetHeaderForTab } = useNavigation();
  const { totalCount, totalAmount, addItem, isCartOpen, setIsCartOpen } = useCart();

  const [catalog, setCatalog] = useState<GuestMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('Lunch');
  const [selectedCourse, setSelectedCourse] = useState<string>('All');
  const [selectedItem, setSelectedItem] = useState<GuestMenuItem | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!sessionToken || !guest) {
      Promise.resolve().then(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });
      return () => {
        isCancelled = true;
      };
    }

    fetchGuestMenu(sessionToken)
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
  }, [sessionToken, guest]);

  const handleRetry = () => {
    if (!sessionToken || !guest) return;

    setLoading(true);
    setError(null);
    fetchGuestMenu(sessionToken)
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
      subtitle: `${item.category}${guest?.roomNumber ? ` · Room ${guest.roomNumber}` : ''}`,
      showBackButton: false,
      hideHeader: true,
      hideBottomNav: true,
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
      subtitle: `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`,
      showBackButton: true,
      hideHeader: false,
      hideBottomNav: true,
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

  if (!sessionToken || !guest) {
    return (
      <div className="w-full py-8 text-center">
        <EmptyState
          title="Guest Session Required"
          description="Please scan your room QR code to view the hotel dining menu."
        />
      </div>
    );
  }

  // If viewing cart screen (Figure 34 & Figure 35 Confirmation)
  if (isCartOpen) {
    return (
      <CartView
        onBack={handleBackToMenu}
        onPlaceOrder={(order) => {
          setPageHeader({
            title: 'Order Confirmed',
            subtitle: `Order #${order.orderId}`,
            showBackButton: false,
            hideHeader: true,
            hideBottomNav: true,
          });
        }}
      />
    );
  }

  // If viewing item detail screen (Figure 33)
  if (selectedItem) {
    return <MenuItemDetail item={selectedItem} onBack={handleBackToMenu} />;
  }

  // Dynamic meal window banner calculation for selected category (Figure 32)
  const categoryPeriodMap: Record<CategoryKey, MealPeriod> = {
    Breakfast: 'BREAKFAST',
    Lunch: 'LUNCH',
    Dinner: 'DINNER',
    Tea: 'ALL_DAY',
  };

  const targetPeriod: MealPeriod = categoryPeriodMap[selectedCategory] || 'ALL_DAY';
  const categoryWindow =
    catalog?.mealWindows.find(
      (w) => w.period === targetPeriod || w.name.toLowerCase() === selectedCategory.toLowerCase(),
    ) ||
    catalog?.mealWindows.find((w) => w.isActive) ||
    catalog?.mealWindows[0];

  const cutoffTimeDisplay = categoryWindow ? categoryWindow.cutoffTime.slice(0, 5) : '14:30';
  const remainingMinutes = categoryWindow ? Math.floor(categoryWindow.secondsRemaining / 60) : 0;
  const hoursLeft = Math.floor(remainingMinutes / 60);
  const minsLeft = remainingMinutes % 60;
  const timeLeftDisplay =
    remainingMinutes > 0
      ? `${hoursLeft > 0 ? `${hoursLeft}h ` : ''}${minsLeft}m left`
      : 'service ended';

  // Canonical data model alignment:
  // Subsystem KMS items provide food course categories (Starters, Mains, Desserts, Beverages)
  // along with mealPeriods (BREAKFAST, LUNCH, DINNER, ALL_DAY).
  // Legacy or demo items may directly categorize by meal period (e.g. category: 'Lunch').
  const displayedItems = (catalog?.items || []).filter((item) => {
    const matchesMealPeriod =
      item.mealPeriods && item.mealPeriods.length > 0
        ? item.mealPeriods.some(
            (p) =>
              p === targetPeriod ||
              p === 'ALL_DAY' ||
              (targetPeriod === 'ALL_DAY' && p === 'TEA_TIME'),
          )
        : false;

    const matchesCategoryDirectly =
      item.category.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === 'Tea' &&
        (item.category.toLowerCase().includes('tea') ||
          item.category.toLowerCase().includes('beverage')));

    if (!matchesMealPeriod && !matchesCategoryDirectly) {
      return false;
    }

    if (selectedCourse && selectedCourse !== 'All') {
      return item.category.toLowerCase() === selectedCourse.toLowerCase();
    }

    return true;
  });

  const availableCourses: string[] = [];
  if (catalog?.items) {
    const courseSet = new Set<string>();
    for (const item of catalog.items) {
      const inPeriod =
        item.mealPeriods?.some(
          (p) =>
            p === targetPeriod ||
            p === 'ALL_DAY' ||
            (targetPeriod === 'ALL_DAY' && p === 'TEA_TIME'),
        ) ||
        item.category.toLowerCase() === selectedCategory.toLowerCase() ||
        (selectedCategory === 'Tea' &&
          (item.category.toLowerCase().includes('tea') ||
            item.category.toLowerCase().includes('beverage')));

      if (
        inPeriod &&
        item.category &&
        item.category.toLowerCase() !== selectedCategory.toLowerCase()
      ) {
        courseSet.add(item.category);
      }
    }
    availableCourses.push(...Array.from(courseSet));
  }

  return (
    <div
      role="tabpanel"
      id="tabpanel-menu"
      aria-labelledby="nav-tab-menu"
      className="w-full space-y-3 pb-24"
    >
      {/* Category Tabs Header (Figure 32: Breakfast | Lunch | Dinner | Tea) */}
      <div
        role="tablist"
        aria-label="Meal periods"
        className="flex items-center justify-between border-b border-slate-200 bg-white -mx-4 px-3 py-0.5 select-none shadow-xs"
      >
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setSelectedCategory(cat.key);
                setSelectedCourse('All');
              }}
              className={`flex-1 py-2 text-center text-xs font-bold transition-all relative ${
                isSelected
                  ? 'text-[#1D3557] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2.5px] after:bg-[#1D3557] after:rounded-full'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Meal Period Banner (Figure 32: "Lunch orders close at 14:30 — 2h 16m left") */}
      <div className="w-full bg-[#FFFBEB] border-l-4 border-[#F59E0B] rounded-xl px-3.5 py-2.5 flex items-center gap-2 shadow-xs">
        <span className="text-sm select-none" aria-hidden="true">
          ⏱
        </span>
        <span className="text-xs font-medium text-amber-950">
          {selectedCategory} orders close at{' '}
          <strong className="font-extrabold">{cutoffTimeDisplay}</strong> —{' '}
          {timeLeftDisplay === 'service ended' ? '2h 16m left' : timeLeftDisplay}
        </span>
      </div>

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
              className="!h-11 !rounded-full !bg-[#1D3557] hover:!bg-[#162A45] active:scale-[0.99] !font-bold text-xs shadow-xl flex items-center justify-center gap-2 text-white"
            >
              <span>
                View Cart · {totalCount} {totalCount === 1 ? 'item' : 'items'} ·{' '}
                {formatLkrPrice(totalAmount)}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
