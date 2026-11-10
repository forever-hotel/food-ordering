import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_PERIOD_MAP,
  evaluateMealWindowStatus,
  formatRemainingTime,
  formatTime12Hour,
  getColomboTime,
  getItemAvailability,
  isItemCurrentlyOrderable,
  isItemCutoff,
  parseTimeToSeconds,
} from '../src/lib/utils/meal-windows.ts';
import type { GuestMenuItem, MealPeriod, MealWindowStatus } from '../src/types/menu.ts';

// Authoritative operational meal schedule definitions in Asia/Colombo (4 windows per KMS contract)
const MOCK_AUTHORITATIVE_MEAL_WINDOWS: MealWindowStatus[] = [
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
    isActive: false,
    isCutoffReached: false,
    secondsRemaining: 0,
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
    name: 'All-Day Dining',
    startTime: '06:00:00',
    cutoffTime: '23:00:00',
    isActive: false,
    isCutoffReached: false,
    secondsRemaining: 0,
  },
];

describe('Issue #101 Phase 2: Authoritative Meal Period Mapping & Unapproved Schedule Isolation', () => {
  it('correctly maps Breakfast to BREAKFAST', () => {
    assert.equal(CATEGORY_PERIOD_MAP.Breakfast, 'BREAKFAST');
  });

  it('correctly maps Lunch to LUNCH', () => {
    assert.equal(CATEGORY_PERIOD_MAP.Lunch, 'LUNCH');
  });

  it('correctly maps Dinner to DINNER', () => {
    assert.equal(CATEGORY_PERIOD_MAP.Dinner, 'DINNER');
  });

  it('strictly maps Tea to TEA_TIME and NOT to ALL_DAY', () => {
    assert.equal(CATEGORY_PERIOD_MAP.Tea, 'TEA_TIME');
    assert.notEqual(CATEGORY_PERIOD_MAP.Tea, 'ALL_DAY');
  });

  it('recognizes that backend KMS contract does not return a TEA_TIME window', () => {
    const targetPeriod = CATEGORY_PERIOD_MAP.Tea;
    assert.equal(targetPeriod, 'TEA_TIME');
    const foundWindow = MOCK_AUTHORITATIVE_MEAL_WINDOWS.find((w) => w.period === targetPeriod);
    assert.equal(foundWindow, undefined, 'Authoritative backend contract has no TEA_TIME window');
  });
});

describe('Issue #101 Phase 3: Time Formatting and Colombo Timezone Handling', () => {
  it('formats 24-hour time strings to readable 12-hour format with AM/PM', () => {
    assert.equal(formatTime12Hour('06:30:00'), '6:30 AM');
    assert.equal(formatTime12Hour('10:30:00'), '10:30 AM');
    assert.equal(formatTime12Hour('12:00:00'), '12:00 PM');
    assert.equal(formatTime12Hour('14:30:00'), '2:30 PM');
    assert.equal(formatTime12Hour('15:00:00'), '3:00 PM');
    assert.equal(formatTime12Hour('17:30:00'), '5:30 PM');
    assert.equal(formatTime12Hour('18:30:00'), '6:30 PM');
    assert.equal(formatTime12Hour('22:30:00'), '10:30 PM');
    assert.equal(formatTime12Hour('00:00:00'), '12:00 AM');
    assert.equal(formatTime12Hour('14:30'), '2:30 PM');
  });

  it('correctly parses time strings into seconds of the day', () => {
    assert.equal(parseTimeToSeconds('06:30:00'), 23400);
    assert.equal(parseTimeToSeconds('10:30:00'), 37800);
    assert.equal(parseTimeToSeconds('12:00:00'), 43200);
    assert.equal(parseTimeToSeconds('15:00:00'), 54000);
    assert.equal(parseTimeToSeconds('00:00:00'), 0);
  });

  it('formats remaining countdowns with human-friendly units without negative values', () => {
    assert.equal(formatRemainingTime(8160), '2h 16m');
    assert.equal(formatRemainingTime(4500), '1h 15m');
    assert.equal(formatRemainingTime(3600), '1h');
    assert.equal(formatRemainingTime(2700), '45 minutes');
    assert.equal(formatRemainingTime(60), '1 minute');
    assert.equal(formatRemainingTime(30), 'less than a minute');
    assert.equal(formatRemainingTime(0), '0 minutes');
    assert.equal(formatRemainingTime(-100), '0 minutes');
  });

  it('evaluates Colombo time (UTC+5:30) deterministically regardless of input date timezone', () => {
    // 2026-11-02T06:30:00Z is 12:00:00 PM in Colombo (UTC+5:30)
    const utcDate = new Date('2026-11-02T06:30:00Z');
    const colombo = getColomboTime(utcDate);
    assert.equal(colombo.hours, 12);
    assert.equal(colombo.minutes, 0);
    assert.equal(colombo.seconds, 0);
    assert.equal(colombo.totalSecondsOfDay, 12 * 3600);

    // 2026-11-02T01:00:00Z is 06:30:00 AM in Colombo
    const morningDate = new Date('2026-11-02T01:00:00Z');
    const morningColombo = getColomboTime(morningDate);
    assert.equal(morningColombo.hours, 6);
    assert.equal(morningColombo.minutes, 30);
    assert.equal(morningColombo.seconds, 0);
    assert.equal(morningColombo.totalSecondsOfDay, 6 * 3600 + 30 * 60);
  });

  it('handles midnight and date boundaries in Asia/Colombo', () => {
    // 2026-11-01T18:30:00Z is 2026-11-02T00:00:00 in Colombo
    const midnightDate = new Date('2026-11-01T18:30:00Z');
    const midnight = getColomboTime(midnightDate);
    assert.equal(midnight.hours, 0);
    assert.equal(midnight.minutes, 0);
    assert.equal(midnight.seconds, 0);
    assert.equal(midnight.totalSecondsOfDay, 0);
  });
});

describe('Issue #101 Phase 3 & 4: Guest-Friendly Messages and Tea Tab Experience', () => {
  const breakfastWindow = MOCK_AUTHORITATIVE_MEAL_WINDOWS.find((w) => w.period === 'BREAKFAST')!;
  const lunchWindow = MOCK_AUTHORITATIVE_MEAL_WINDOWS.find((w) => w.period === 'LUNCH')!;
  const dinnerWindow = MOCK_AUTHORITATIVE_MEAL_WINDOWS.find((w) => w.period === 'DINNER')!;

  it('State 1: Upcoming meal window (before opening)', () => {
    const currentSeconds = 5 * 3600 + 30 * 60; // 05:30 AM
    const status = evaluateMealWindowStatus(breakfastWindow, currentSeconds, 'Breakfast');

    assert.equal(status.state, 'upcoming');
    assert.equal(status.isOrderable, false);
    assert.equal(status.secondsRemaining, 0);
    assert.equal(
      status.message,
      'Breakfast ordering starts at 6:30 AM. You can browse the menu in the meantime.',
    );
  });

  it('State 2: Currently open meal window with countdown', () => {
    const currentSeconds = 13 * 3600 + 45 * 60; // 01:45 PM -> 1h 15m left until 3:00 PM
    const status = evaluateMealWindowStatus(lunchWindow, currentSeconds, 'Lunch');

    assert.equal(status.state, 'open');
    assert.equal(status.isOrderable, true);
    assert.equal(status.secondsRemaining, 4500);
    assert.equal(
      status.message,
      'Lunch orders are open until 3:00 PM. You have 1h 15m left to place an order.',
    );
  });

  it('State 3: Closed meal window (service ended / cutoff reached)', () => {
    const currentSeconds = 11 * 3600; // 11:00 AM (Breakfast closed at 10:30 AM)
    const status = evaluateMealWindowStatus(breakfastWindow, currentSeconds, 'Breakfast');

    assert.equal(status.state, 'closed');
    assert.equal(status.isOrderable, false);
    assert.equal(status.secondsRemaining, 0);
    assert.equal(
      status.message,
      'Breakfast ordering has closed for today. Please check the other menus for available options.',
    );
  });

  it('verifies Dinner window upcoming and open messages', () => {
    // 16:00 (4:00 PM) -> Dinner starts at 6:30 PM (18:30)
    const upcoming = evaluateMealWindowStatus(dinnerWindow, 16 * 3600, 'Dinner');
    assert.equal(upcoming.state, 'upcoming');
    assert.equal(
      upcoming.message,
      'Dinner ordering starts at 6:30 PM. You can browse the menu in the meantime.',
    );

    // 19:30 (7:30 PM) -> Dinner open until 10:30 PM (22:30), 3h left
    const open = evaluateMealWindowStatus(dinnerWindow, 19 * 3600 + 30 * 60, 'Dinner');
    assert.equal(open.state, 'open');
    assert.equal(
      open.message,
      'Dinner orders are open until 10:30 PM. You have 3h left to place an order.',
    );
  });

  it('State 4: Tea Tab without a backend TEA_TIME schedule renders guest-friendly informative message without claiming error', () => {
    // When viewing the Tea tab and backend has no dedicated TEA_TIME window
    const status = evaluateMealWindowStatus(undefined, 15 * 3600, 'Tea');

    assert.equal(status.state, 'unavailable');
    assert.equal(status.isOrderable, false);
    assert.equal(status.secondsRemaining, 0);
    // Guest-friendly explanation that does not claim API failure
    assert.equal(
      status.message,
      "Tea and snack selections are shown below. Please check each item's availability before ordering.",
    );
  });

  it('State 4: Missing schedule for Breakfast, Lunch, or Dinner explains hours could not be loaded', () => {
    const status = evaluateMealWindowStatus(undefined, 12 * 3600, 'Lunch');

    assert.equal(status.state, 'unavailable');
    assert.equal(status.isOrderable, false);
    assert.equal(
      status.message,
      "We couldn't load the ordering hours right now. Please try again.",
    );
  });

  it('transitions active window to closed as soon as client clock reaches cutoff', () => {
    const lunchCutoff = 15 * 3600; // 15:00:00

    // 1 second before cutoff: open
    const beforeCutoff = evaluateMealWindowStatus(lunchWindow, lunchCutoff - 1, 'Lunch');
    assert.equal(beforeCutoff.state, 'open');
    assert.equal(beforeCutoff.isOrderable, true);
    assert.equal(beforeCutoff.secondsRemaining, 1);

    // Exact cutoff second: closed
    const atCutoff = evaluateMealWindowStatus(lunchWindow, lunchCutoff, 'Lunch');
    assert.equal(atCutoff.state, 'closed');
    assert.equal(atCutoff.isOrderable, false);
    assert.equal(atCutoff.secondsRemaining, 0);
  });
});

describe('Issue #101 Phase 4: Authoritative Orderability & Cutoff Enforcement Rules', () => {
  const breakfastItem: GuestMenuItem = {
    id: 'item-b1',
    name: 'Eggs Benedict',
    description: 'Poached eggs on brioche',
    price: 950,
    category: 'Breakfast',
    mealPeriods: ['BREAKFAST'],
    dietaryFlags: [],
    allergens: ['Egg', 'Gluten'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 5,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 15,
  };

  const lunchDinnerItem: GuestMenuItem = {
    id: 'item-m1',
    name: 'Chicken Rice',
    description: 'Steamed rice with grilled chicken',
    price: 1200,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    dietaryFlags: ['Gluten-free'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 20,
  };

  const teaAllDayBeverage: GuestMenuItem = {
    id: 'item-ad1',
    name: 'Ceylon Black Tea',
    description: 'Freshly brewed single-origin tea',
    price: 400,
    category: 'Beverages',
    mealPeriods: ['ALL_DAY'],
    dietaryFlags: ['Vegan'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 5,
  };

  const soldOutItem: GuestMenuItem = {
    ...lunchDinnerItem,
    id: 'item-so1',
    available: false, // Sold out
  };

  const serverUnorderableItem: GuestMenuItem = {
    ...lunchDinnerItem,
    id: 'item-unord1',
    isOrderable: false, // Server says not orderable
  };

  const serverCutoffItem: GuestMenuItem = {
    ...lunchDinnerItem,
    id: 'item-cut1',
    isCutoff: true, // Server says cutoff reached
  };

  it('Rule 1: Sold-out items (available === false) can NEVER be ordered under any clock condition', () => {
    // During active Lunch (13:00)
    assert.equal(
      isItemCurrentlyOrderable(soldOutItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 13 * 3600),
      false,
    );
    // During active Dinner (19:00)
    assert.equal(
      isItemCurrentlyOrderable(soldOutItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 19 * 3600),
      false,
    );
  });

  it('Rule 1: Server-disallowed items (isOrderable === false) can NEVER be overridden to orderable by client clock', () => {
    // Even at 13:00 during peak Lunch, client clock cannot bypass server rejection
    assert.equal(
      isItemCurrentlyOrderable(serverUnorderableItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 13 * 3600),
      false,
    );
  });

  it('Rule 1: Server-cutoff items (isCutoff === true) can NEVER be ordered', () => {
    assert.equal(
      isItemCurrentlyOrderable(serverCutoffItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 13 * 3600),
      false,
    );
  });

  it('Rule 2: For regular meal windows, enforces start and cutoff times and transitions to closed at cutoff', () => {
    // Lunch: 12:00:00 (43,200s) to 15:00:00 (54,000s)
    // 11:59:59 (before opening) -> false
    assert.equal(
      isItemCurrentlyOrderable(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 43200 - 1),
      false,
    );

    // 12:00:00 (opening second) -> true
    assert.equal(
      isItemCurrentlyOrderable(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 43200),
      true,
    );

    // 14:59:59 (1 second before cutoff) -> true
    assert.equal(
      isItemCurrentlyOrderable(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 54000 - 1),
      true,
    );

    // 15:00:00 (exact cutoff) -> false (client immediately transitions to closed)
    assert.equal(
      isItemCurrentlyOrderable(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 54000),
      false,
    );
  });

  it('Rule 3: Missing ALL_DAY window definition does NOT fabricate an unapproved 06:00–23:00 schedule', () => {
    // Windows list with NO ALL_DAY window definition
    const windowsWithoutAllDay: MealWindowStatus[] = MOCK_AUTHORITATIVE_MEAL_WINDOWS.filter(
      (w) => w.period !== 'ALL_DAY',
    );

    // Client clock must not fabricate a schedule; without a window, it cannot open the window
    assert.equal(
      isItemCurrentlyOrderable(teaAllDayBeverage, windowsWithoutAllDay, 14 * 3600),
      false,
      'Must not fabricate 06:00-23:00 when ALL_DAY window definition is missing',
    );
  });

  it('Rule 4: Standard ALL_DAY dining enforces 06:00 to 23:00 when demo mode is not active', () => {
    // 12:00 PM (within 06:00-23:00) -> orderable
    assert.equal(
      isItemCurrentlyOrderable(teaAllDayBeverage, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 12 * 3600, {
        isDemoMode: false,
      }),
      true,
    );

    // 23:30 (11:30 PM, after 23:00 cutoff) -> NOT orderable in production/standard mode
    assert.equal(
      isItemCurrentlyOrderable(
        teaAllDayBeverage,
        MOCK_AUTHORITATIVE_MEAL_WINDOWS,
        23 * 3600 + 30 * 60,
        { isDemoMode: false },
      ),
      false,
    );
  });

  it('Rule 5: When explicit DEMO_MODE is active, ALL_DAY is continuously active (24/7)', () => {
    // 23:30 (11:30 PM) with explicit isDemoMode: true -> orderable
    assert.equal(
      isItemCurrentlyOrderable(
        teaAllDayBeverage,
        MOCK_AUTHORITATIVE_MEAL_WINDOWS,
        23 * 3600 + 30 * 60,
        { isDemoMode: true },
      ),
      true,
    );

    // 03:00 AM with explicit isDemoMode: true -> orderable
    assert.equal(
      isItemCurrentlyOrderable(teaAllDayBeverage, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 3 * 3600, {
        isDemoMode: true,
      }),
      true,
    );

    // But Breakfast-only item at 03:00 AM remains NOT orderable even in demo mode
    assert.equal(
      isItemCurrentlyOrderable(breakfastItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 3 * 3600, {
        isDemoMode: true,
      }),
      false,
    );
  });

  it('Rule 6: Allows ordering of available ALL_DAY beverages and snacks under the Tea tab', () => {
    // When guest is on the Tea tab, Ceylon Black Tea (ALL_DAY) is orderable during daytime hours
    const currentSeconds = 15 * 3600 + 30 * 60; // 3:30 PM
    assert.equal(
      isItemCurrentlyOrderable(teaAllDayBeverage, MOCK_AUTHORITATIVE_MEAL_WINDOWS, currentSeconds),
      true,
    );

    // Outside ordering hours item is marked cutoff
    assert.equal(
      isItemCutoff(breakfastItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, currentSeconds),
      true,
    );
  });
});

describe('TC-DDP-101-AC3: Fine-Grained Item Availability States & Guest Messages', () => {
  const breakfastItem: GuestMenuItem = {
    id: 'item-b1',
    name: 'Eggs Benedict',
    description: 'Poached eggs on brioche',
    price: 950,
    category: 'Breakfast',
    mealPeriods: ['BREAKFAST'],
    dietaryFlags: [],
    allergens: ['Egg', 'Gluten'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 5,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 15,
  };

  const lunchDinnerItem: GuestMenuItem = {
    id: 'item-m1',
    name: 'Chicken Rice',
    description: 'Steamed rice with grilled chicken',
    price: 1200,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    dietaryFlags: ['Gluten-free'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 20,
  };

  const allDayItem: GuestMenuItem = {
    id: 'item-ad1',
    name: 'Ceylon Black Tea',
    description: 'Freshly brewed single-origin tea',
    price: 400,
    category: 'Beverages',
    mealPeriods: ['ALL_DAY'],
    dietaryFlags: ['Vegan'],
    allergens: [],
    available: true,
    isOrderable: true,
    isCutoff: false,
    portionCap: 10,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 5,
  };

  const soldOutItem: GuestMenuItem = {
    ...lunchDinnerItem,
    id: 'item-so1',
    available: false,
  };

  const serverUnorderableItem: GuestMenuItem = {
    ...lunchDinnerItem,
    id: 'item-unord1',
    isOrderable: false,
  };

  it('distinguishes "sold_out" state with clear badge, CTA and quick add error', () => {
    // During active Lunch (13:00)
    const result = getItemAvailability(soldOutItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 13 * 3600);
    assert.equal(result.state, 'sold_out');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Sold Out');
    assert.equal(result.buttonLabel, 'Item Sold Out');
    assert.equal(result.quickAddErrorMessage, 'Item is sold out.');
  });

  it('distinguishes "not_yet_open" before morning opening hours (e.g. 05:00 AM)', () => {
    // 05:00 AM (Breakfast opens at 06:30)
    const result = getItemAvailability(breakfastItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 5 * 3600);
    assert.equal(result.state, 'not_yet_open');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Opens at 6:30 AM');
    assert.equal(result.buttonLabel, 'Ordering Not Yet Open');
    assert.match(result.quickAddErrorMessage || '', /starts at 6:30 AM/);
  });

  it('distinguishes "not_yet_open" for multi-period item between service windows (e.g. 16:00)', () => {
    // 16:00 (4:00 PM: Lunch cutoff 15:00 passed, Dinner opens at 18:30)
    const result = getItemAvailability(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 16 * 3600);
    assert.equal(result.state, 'not_yet_open');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Opens at 6:30 PM');
    assert.equal(result.buttonLabel, 'Ordering Not Yet Open');
    assert.match(result.quickAddErrorMessage || '', /starts at 6:30 PM/);
  });

  it('distinguishes "closed" when all daily ordering windows have passed cutoff (e.g. 23:00)', () => {
    // 23:00 (11:00 PM: Dinner cutoff was 22:30, no more windows today)
    const result = getItemAvailability(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 23 * 3600);
    assert.equal(result.state, 'closed');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Closed');
    assert.equal(result.buttonLabel, 'Ordering Closed');
    assert.equal(result.quickAddErrorMessage, 'Ordering for this item has closed for today.');
  });

  it('distinguishes "temporarily_unavailable" when server marks isOrderable=false', () => {
    const result = getItemAvailability(
      serverUnorderableItem,
      MOCK_AUTHORITATIVE_MEAL_WINDOWS,
      13 * 3600,
    );
    assert.equal(result.state, 'temporarily_unavailable');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Unavailable');
    assert.equal(result.buttonLabel, 'Service Unavailable');
    assert.equal(result.quickAddErrorMessage, 'This item is currently unavailable.');
  });

  it('distinguishes "temporarily_unavailable" when window schedule definition is completely missing', () => {
    const itemWithMissingWindow: GuestMenuItem = {
      ...lunchDinnerItem,
      mealPeriods: ['UNKNOWN_WINDOW' as unknown as MealPeriod],
    };
    const result = getItemAvailability(
      itemWithMissingWindow,
      MOCK_AUTHORITATIVE_MEAL_WINDOWS,
      13 * 3600,
    );
    assert.equal(result.state, 'temporarily_unavailable');
    assert.equal(result.isOrderable, false);
    assert.equal(result.badgeLabel, 'Unavailable');
    assert.equal(result.buttonLabel, 'Service Unavailable');
  });

  it('correctly reports "available" during active window with Add to Cart button', () => {
    // 13:00 (active Lunch)
    const result = getItemAvailability(lunchDinnerItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS, 13 * 3600);
    assert.equal(result.state, 'available');
    assert.equal(result.isOrderable, true);
    assert.equal(result.badgeLabel, null);
    assert.equal(result.buttonLabel, 'Add to Cart');
  });

  it('ALL_DAY outside standard hours (23:30) is closed in production but available in demo mode', () => {
    const lateNightSeconds = 23 * 3600 + 30 * 60; // 11:30 PM

    // Standard mode (production / API mode)
    const standardResult = getItemAvailability(
      allDayItem,
      MOCK_AUTHORITATIVE_MEAL_WINDOWS,
      lateNightSeconds,
      { isDemoMode: false },
    );
    assert.equal(standardResult.state, 'closed');
    assert.equal(standardResult.isOrderable, false);

    // Explicit demo mode
    const demoResult = getItemAvailability(
      allDayItem,
      MOCK_AUTHORITATIVE_MEAL_WINDOWS,
      lateNightSeconds,
      { isDemoMode: true },
    );
    assert.equal(demoResult.state, 'available');
    assert.equal(demoResult.isOrderable, true);
    assert.equal(demoResult.buttonLabel, 'Add to Cart');
  });

  it('evaluateMealWindowStatus handles server-authorized active ALL_DAY window', () => {
    const allDayWindow: MealWindowStatus = {
      period: 'ALL_DAY',
      name: 'All-Day Dining',
      startTime: '06:00:00',
      cutoffTime: '23:00:00',
      isActive: true,
      isCutoffReached: false,
      secondsRemaining: 3600,
    };

    const state = evaluateMealWindowStatus(allDayWindow, 23 * 3600 + 30 * 60);
    assert.equal(state.state, 'open');
    assert.equal(state.isOrderable, true);
    assert.equal(state.secondsRemaining, 3600);
  });

  it('handles empty meal windows array and empty item periods gracefully across evaluators', () => {
    const item: GuestMenuItem = {
      id: 'item-empty',
      name: 'Item Empty',
      price: 100,
      category: 'MAINS',
      available: true,
      isOrderable: true,
      isCutoff: false,
      mealPeriods: [],
    } as any;

    // isItemCurrentlyOrderable
    assert.equal(isItemCurrentlyOrderable(item, []), true);
    assert.equal(isItemCurrentlyOrderable(item, MOCK_AUTHORITATIVE_MEAL_WINDOWS), true);

    // isItemCutoff
    assert.equal(isItemCutoff(item, []), false);
    assert.equal(isItemCutoff(item, MOCK_AUTHORITATIVE_MEAL_WINDOWS), false);

    // getItemAvailability with unorderable item and empty windows
    const unorderableItem: GuestMenuItem = {
      ...item,
      isOrderable: false,
    };
    const avail1 = getItemAvailability(unorderableItem, []);
    assert.equal(avail1.state, 'temporarily_unavailable');
    assert.equal(avail1.isOrderable, false);

    const avail2 = getItemAvailability(unorderableItem, MOCK_AUTHORITATIVE_MEAL_WINDOWS);
    assert.equal(avail2.state, 'temporarily_unavailable');
    assert.equal(avail2.isOrderable, false);
  });
});

it('keeps a kitchen-disabled lunch closed even inside its nominal hours', () => {
  const result = evaluateMealWindowStatus(
    {
      period: 'LUNCH',
      name: 'Demo Lunch',
      startTime: '10:00:00',
      cutoffTime: '15:00:00',
      isActive: false,
      isCutoffReached: true,
      secondsRemaining: 0,
      enabled: false,
    },
    12 * 3600,
    'Lunch',
  );
  assert.equal(result.state, 'closed');
  assert.equal(result.isOrderable, false);
  assert.match(result.message, /paused by the kitchen/);
});
