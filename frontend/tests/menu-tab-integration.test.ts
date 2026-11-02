import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_PERIOD_MAP,
  evaluateMealWindowStatus,
  getItemAvailability,
  type OrderableEvaluationOptions,
} from '../src/lib/utils/meal-windows.ts';
import type { GuestMenuItem, MealWindowStatus } from '../src/types/menu.ts';
import { MAX_ORDER_ITEM_QUANTITY } from '../src/lib/constants/order-policy.ts';

describe('TC-DDP-101-AC4: MenuTab Integration — Availability, Messages & Controls', () => {
  const AUTHORITATIVE_MEAL_WINDOWS: MealWindowStatus[] = [
    {
      period: 'BREAKFAST',
      name: 'Breakfast',
      startTime: '06:30:00',
      cutoffTime: '10:30:00',
      isActive: false,
      isCutoffReached: false,
      secondsRemaining: 0,
    },
    {
      period: 'LUNCH',
      name: 'Lunch',
      startTime: '12:00:00',
      cutoffTime: '15:00:00',
      isActive: true,
      isCutoffReached: false,
      secondsRemaining: 3600,
    },
    {
      period: 'DINNER',
      name: 'Dinner',
      startTime: '18:30:00',
      cutoffTime: '22:30:00',
      isActive: false,
      isCutoffReached: false,
      secondsRemaining: 0,
    },
    {
      period: 'ALL_DAY',
      name: 'All Day Dining',
      startTime: '06:00:00',
      cutoffTime: '23:00:00',
      isActive: true,
      isCutoffReached: false,
      secondsRemaining: 36000,
    },
  ];

  const sampleBreakfastItem: GuestMenuItem = {
    id: 'item-bk-1',
    name: 'Sri Lankan Breakfast Platter',
    description: 'String hoppers with pol sambol and dhal curry',
    price: 850,
    category: 'Breakfast',
    mealPeriods: ['BREAKFAST'],
    dietaryFlags: ['Vegetarian'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 15,
  };

  const sampleLunchDinnerItem: GuestMenuItem = {
    id: 'item-ln-1',
    name: 'Grilled Seafood Rice',
    description: 'Fresh seafood medley with basmati rice',
    price: 1850,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    dietaryFlags: ['Gluten-free'],
    allergens: ['Crustaceans'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 5,
    imageUrl: null,
    secondsRemainingUntilCutoff: 3600,
    estimatedPrepMinutes: 25,
  };

  const sampleTeaAllDayBeverage: GuestMenuItem = {
    id: 'item-tea-1',
    name: 'Ceylon High-Grown Tea',
    description: 'Finest hand-picked Nuwara Eliya tea leaves',
    price: 350,
    category: 'Beverages',
    mealPeriods: ['ALL_DAY'],
    dietaryFlags: ['Vegan'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 36000,
    estimatedPrepMinutes: 5,
  };

  const sampleSoldOutItem: GuestMenuItem = {
    ...sampleLunchDinnerItem,
    id: 'item-so-1',
    available: false, // Out of stock
  };

  const sampleServerCutoffItem: GuestMenuItem = {
    ...sampleLunchDinnerItem,
    id: 'item-sc-1',
    isCutoff: true, // Cutoff reached on server
  };

  const sampleServerUnorderableItem: GuestMenuItem = {
    ...sampleLunchDinnerItem,
    id: 'item-su-1',
    isOrderable: false, // Server disallowed
  };

  describe('Integration 1: Quick Add flow validation and guest feedback', () => {
    it('Quick Add succeeds for available item during active window', () => {
      // 13:00 (Lunch is active)
      const currentSeconds = 13 * 3600;
      const availability = getItemAvailability(
        sampleLunchDinnerItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.isOrderable, true);
      assert.equal(availability.state, 'available');
    });

    it('Quick Add rejects sold-out item with plain-language notification', () => {
      const currentSeconds = 13 * 3600;
      const availability = getItemAvailability(
        sampleSoldOutItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.isOrderable, false);
      assert.equal(availability.state, 'sold_out');
      assert.equal(availability.quickAddErrorMessage, 'Item is sold out.');
    });

    it('Quick Add rejects not-yet-open item with informative opening time', () => {
      // 05:00 AM (Breakfast opens at 06:30)
      const currentSeconds = 5 * 3600;
      const availability = getItemAvailability(
        sampleBreakfastItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.isOrderable, false);
      assert.equal(availability.state, 'not_yet_open');
      assert.match(availability.quickAddErrorMessage || '', /starts at 6:30 AM/);
    });

    it('Quick Add rejects closed item after daily service cutoff', () => {
      // 23:00 (Dinner closed at 22:30)
      const currentSeconds = 23 * 3600;
      const availability = getItemAvailability(
        sampleLunchDinnerItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.isOrderable, false);
      assert.equal(availability.state, 'closed');
      assert.equal(
        availability.quickAddErrorMessage,
        'Ordering for this item has closed for today.',
      );
    });

    it('Quick Add rejects server-cutoff item with closed notification', () => {
      const currentSeconds = 13 * 3600;
      const availability = getItemAvailability(
        sampleServerCutoffItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.isOrderable, false);
      assert.equal(availability.state, 'closed');
      assert.equal(
        availability.quickAddErrorMessage,
        'Ordering for this item has closed for today.',
      );
    });
  });

  describe('Integration 2: MenuItemCard and MenuItemDetail CTA & Badge States', () => {
    it('computes actionable state for available item with "+" button and "Add to Cart" CTA', () => {
      const currentSeconds = 13 * 3600;
      const availability = getItemAvailability(
        sampleLunchDinnerItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'available');
      assert.equal(availability.badgeLabel, null);
      assert.equal(availability.buttonLabel, 'Add to Cart');
    });

    it('computes non-actionable state for sold-out item with "Sold Out" badge and CTA', () => {
      const currentSeconds = 13 * 3600;
      const availability = getItemAvailability(
        sampleSoldOutItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'sold_out');
      assert.equal(availability.badgeLabel, 'Sold Out');
      assert.equal(availability.buttonLabel, 'Item Sold Out');
    });

    it('computes "Opens at 12:00 PM" badge and "Ordering Not Yet Open" CTA before Lunch opening', () => {
      // 11:00 AM (Lunch opens at 12:00 PM)
      const currentSeconds = 11 * 3600;
      const availability = getItemAvailability(
        sampleLunchDinnerItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'not_yet_open');
      assert.equal(availability.badgeLabel, 'Opens at 12:00 PM');
      assert.equal(availability.buttonLabel, 'Ordering Not Yet Open');
    });

    it('computes "Closed" badge and "Ordering Closed" CTA after Lunch cutoff', () => {
      // 15:30 (Lunch cutoff 15:00 passed, item only Breakfast)
      const currentSeconds = 15 * 3600 + 30 * 60;
      const availability = getItemAvailability(
        sampleBreakfastItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'closed');
      assert.equal(availability.badgeLabel, 'Closed');
      assert.equal(availability.buttonLabel, 'Ordering Closed');
    });

    it('disables item detail quantity counter and handles maximum portion in cart', () => {
      const portionCap = sampleLunchDinnerItem.portionCap ?? MAX_ORDER_ITEM_QUANTITY;
      const cartQuantity = 5; // Reached portion cap of 5
      const remainingAllowance = Math.max(0, portionCap - cartQuantity);

      assert.equal(remainingAllowance, 0);

      const availability = getItemAvailability(
        sampleLunchDinnerItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        13 * 3600,
      );

      // Even though item is available, remaining allowance is 0
      const canOrder = availability.state === 'available' && remainingAllowance > 0;
      assert.equal(canOrder, false);

      const buttonText =
        availability.state !== 'available'
          ? availability.buttonLabel
          : remainingAllowance <= 0
            ? 'Max Portion in Cart'
            : 'Add to Cart';

      assert.equal(buttonText, 'Max Portion in Cart');
    });
  });

  describe('Integration 3: Tea Tab rendering and guest guidance without TEA_TIME window', () => {
    it('Tea category banner renders approved guidance when backend provides no TEA_TIME window', () => {
      // No TEA_TIME in AUTHORITATIVE_MEAL_WINDOWS
      const teaPeriod = CATEGORY_PERIOD_MAP['Tea'];
      assert.equal(teaPeriod, 'TEA_TIME');

      const teaWindow = AUTHORITATIVE_MEAL_WINDOWS.find((w) => w.period === teaPeriod);
      assert.equal(teaWindow, undefined);

      const evaluation = evaluateMealWindowStatus(teaWindow, 15 * 3600 + 30 * 60, 'Tea');
      assert.equal(evaluation.state, 'unavailable');
      assert.equal(
        evaluation.message,
        "Tea and snack selections are shown below. Please check each item's availability before ordering.",
      );
    });

    it('eligible ALL_DAY beverages under Tea tab remain orderable during operational hours', () => {
      // 3:30 PM (15:30)
      const currentSeconds = 15 * 3600 + 30 * 60;
      const availability = getItemAvailability(
        sampleTeaAllDayBeverage,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'available');
      assert.equal(availability.isOrderable, true);
      assert.equal(availability.buttonLabel, 'Add to Cart');
    });

    it('breakfast-only item displayed under Tea tab is not orderable in the afternoon', () => {
      const currentSeconds = 15 * 3600 + 30 * 60;
      const availability = getItemAvailability(
        sampleBreakfastItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
      );

      assert.equal(availability.state, 'closed');
      assert.equal(availability.isOrderable, false);
      assert.equal(availability.buttonLabel, 'Ordering Closed');
    });
  });

  describe('Integration 4: Controlled Mode Options & Backend Agreement', () => {
    it('enforces authoritative standard schedule outside hours (23:30) in production mode', () => {
      const lateNightSeconds = 23 * 3600 + 30 * 60; // 11:30 PM
      const options: OrderableEvaluationOptions = { isDemoMode: false };

      const availability = getItemAvailability(
        sampleTeaAllDayBeverage,
        AUTHORITATIVE_MEAL_WINDOWS,
        lateNightSeconds,
        options,
      );

      // Must be closed in standard / production mode
      assert.equal(availability.state, 'closed');
      assert.equal(availability.isOrderable, false);
      assert.equal(availability.buttonLabel, 'Ordering Closed');
    });

    it('allows continuous 24/7 ALL_DAY ordering outside hours (23:30) in explicit demo mode', () => {
      const lateNightSeconds = 23 * 3600 + 30 * 60; // 11:30 PM
      const options: OrderableEvaluationOptions = { isDemoMode: true };

      const availability = getItemAvailability(
        sampleTeaAllDayBeverage,
        AUTHORITATIVE_MEAL_WINDOWS,
        lateNightSeconds,
        options,
      );

      // Must be available in explicit demo mode
      assert.equal(availability.state, 'available');
      assert.equal(availability.isOrderable, true);
      assert.equal(availability.buttonLabel, 'Add to Cart');
    });

    it('demo mode never allows sold-out or server-disallowed items to become orderable', () => {
      const currentSeconds = 13 * 3600;
      const options: OrderableEvaluationOptions = { isDemoMode: true };

      const soldOutResult = getItemAvailability(
        sampleSoldOutItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
        options,
      );
      assert.equal(soldOutResult.isOrderable, false);
      assert.equal(soldOutResult.state, 'sold_out');

      const serverDisallowedResult = getItemAvailability(
        sampleServerUnorderableItem,
        AUTHORITATIVE_MEAL_WINDOWS,
        currentSeconds,
        options,
      );
      assert.equal(serverDisallowedResult.isOrderable, false);
      assert.equal(serverDisallowedResult.state, 'temporarily_unavailable');
    });
  });
});
