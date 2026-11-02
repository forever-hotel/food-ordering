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

import {
  CATEGORY_PERIOD_MAP,
  type CategoryKey,
  evaluateMealWindowStatus,
  getColomboTime,
  isItemCurrentlyOrderable,
  isItemCutoff,
} from '../../../lib/utils/meal-windows.ts';

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
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Periodically refresh current time to update countdowns and trigger window cutoffs smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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
    const colomboTime = getColomboTime(currentTime);
    const isOrderableNow = isItemCurrentlyOrderable(
      item,
      catalog?.mealWindows,
      colomboTime.totalSecondsOfDay,
    );
    if (!item.available) {
      message.error('Item is sold out.');
      return;
    }
    if (!isOrderableNow) {
      message.error('This item is outside ordering hours.');
      return;
    }

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

  const colomboTime = getColomboTime(currentTime);
  const currentColomboSeconds = colomboTime.totalSecondsOfDay;

  // If viewing item detail screen (Figure 33)
  if (selectedItem) {
    const isOrderableNow = isItemCurrentlyOrderable(
      selectedItem,
      catalog?.mealWindows,
      currentColomboSeconds,
    );
    const isCutoffNow = isItemCutoff(selectedItem, catalog?.mealWindows, currentColomboSeconds);
    const effectiveSelectedItem: GuestMenuItem = {
      ...selectedItem,
      isOrderable: isOrderableNow,
      isCutoff: isCutoffNow,
    };
    return <MenuItemDetail item={effectiveSelectedItem} onBack={handleBackToMenu} />;
  }

  // Authoritative meal period mapping (Tea -> TEA_TIME; ALL_DAY is separate)
  const targetPeriod: MealPeriod = CATEGORY_PERIOD_MAP[selectedCategory];

  // Exact matching only: do not substitute unrelated active windows or arbitrary fallbacks
  const categoryWindow = catalog?.mealWindows.find((w) => w.period === targetPeriod);

  // Authoritative meal window evaluation in Asia/Colombo
  const windowEvaluation = evaluateMealWindowStatus(
    categoryWindow,
    currentColomboSeconds,
    selectedCategory,
  );

  // Canonical data model alignment:
  // Subsystem KMS items provide food course categories (Starters, Mains, Desserts, Beverages)
  // along with mealPeriods (BREAKFAST, LUNCH, DINNER, ALL_DAY).
  // Legacy or demo items may directly categorize by meal period (e.g. category: 'Lunch').
  const displayedItems = (catalog?.items || []).filter((item) => {
    const matchesMealPeriod =
      item.mealPeriods && item.mealPeriods.length > 0
        ? item.mealPeriods.some((p) => p === targetPeriod || p === 'ALL_DAY')
        : false;

    const matchesCategoryDirectly =
      item.category.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === 'Tea' &&
        (item.category.toLowerCase().includes('tea') ||
          item.category.toLowerCase().includes('beverage') ||
          item.category.toLowerCase().includes('snack')));

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
        item.mealPeriods?.some((p) => p === targetPeriod || p === 'ALL_DAY') ||
        item.category.toLowerCase() === selectedCategory.toLowerCase() ||
        (selectedCategory === 'Tea' &&
          (item.category.toLowerCase().includes('tea') ||
            item.category.toLowerCase().includes('beverage') ||
            item.category.toLowerCase().includes('snack')));

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

      {/* Meal Period Banner (Figure 32: Open, Upcoming, Closed, or Unavailable) */}
      <div
        role="status"
        aria-live="polite"
        className={`w-full rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 shadow-xs transition-colors ${
          windowEvaluation.state === 'open'
            ? 'bg-[#FFFBEB] border-l-4 border-[#F59E0B] text-amber-950'
            : windowEvaluation.state === 'upcoming'
              ? 'bg-[#F0F7FF] border-l-4 border-[#3B82F6] text-[#1E3A8A]'
              : windowEvaluation.state === 'closed'
                ? 'bg-[#F8FAFC] border-l-4 border-[#94A3B8] text-slate-700'
                : 'bg-[#FFFDF5] border-l-4 border-[#CBD5E1] text-slate-600'
        }`}
      >
        <span className="text-base select-none flex-shrink-0" aria-hidden="true">
          {windowEvaluation.state === 'open'
            ? '⏱'
            : windowEvaluation.state === 'upcoming'
              ? '🕒'
              : windowEvaluation.state === 'closed'
                ? '🔒'
                : 'ℹ️'}
        </span>
        <span className="text-xs font-medium leading-relaxed">{windowEvaluation.message}</span>
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
          {displayedItems.map((item) => {
            const isOrderableNow = isItemCurrentlyOrderable(
              item,
              catalog?.mealWindows,
              currentColomboSeconds,
            );
            const isCutoffNow = isItemCutoff(item, catalog?.mealWindows, currentColomboSeconds);
            const effectiveItem: GuestMenuItem = {
              ...item,
              isOrderable: isOrderableNow,
              isCutoff: isCutoffNow,
            };
            return (
              <MenuItemCard
                key={item.id}
                item={effectiveItem}
                onSelect={handleSelectItem}
                onQuickAdd={handleQuickAdd}
              />
            );
          })}
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
