import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_PERIOD_MAP,
  evaluateMealWindowStatus,
  formatRemainingTime,
  formatTime12Hour,
  getColomboTime,
  getMealWindowGuestMessage,
  isItemCurrentlyOrderable,
  isItemCutoff,
  parseTimeToSeconds,
} from '../src/lib/utils/meal-windows.ts';
import type { GuestMenuItem, MealWindowStatus } from '../src/types/menu.ts';

// Authoritative meal schedule definitions in Asia/Colombo
const MOCK_MEAL_WINDOWS: MealWindowStatus[] = [
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
    period: 'TEA_TIME',
    name: 'Tea & Snacks',
    startTime: '15:00:00',
    cutoffTime: '17:30:00',
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

describe('Issue #101 Phase 2: Authoritative Meal Period Mapping', () => {
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

  it('treats ALL_DAY strictly as an item availability classification, not a tab window substitute', () => {
    const targetPeriod = CATEGORY_PERIOD_MAP.Tea;
    assert.equal(targetPeriod, 'TEA_TIME');
    // Does not fall back to ALL_DAY
    const foundWindow = MOCK_MEAL_WINDOWS.find((w) => w.period === targetPeriod);
    assert.ok(foundWindow);
    assert.equal(foundWindow.period, 'TEA_TIME');
    assert.equal(foundWindow.startTime, '15:00:00');
    assert.equal(foundWindow.cutoffTime, '17:30:00');
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

describe('Issue #101 Phase 3: Guest-Friendly Status Messages and Window States', () => {
  const breakfastWindow = MOCK_MEAL_WINDOWS.find((w) => w.period === 'BREAKFAST')!;
  const lunchWindow = MOCK_MEAL_WINDOWS.find((w) => w.period === 'LUNCH')!;
  const teaWindow = MOCK_MEAL_WINDOWS.find((w) => w.period === 'TEA_TIME')!;

  it('State 1: Upcoming meal window (before opening)', () => {
    // 05:30 AM in Colombo (19,800 seconds) - Breakfast starts at 06:30 AM
    const currentSeconds = 5 * 3600 + 30 * 60;
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
    // 01:45 PM in Colombo (13:45 = 49,500s) - Lunch cutoff is 03:00 PM (54,000s)
    // Remaining time: 4,500s = 1h 15m
    const currentSeconds = 13 * 3600 + 45 * 60;
    const status = evaluateMealWindowStatus(lunchWindow, currentSeconds, 'Lunch');

    assert.equal(status.state, 'open');
    assert.equal(status.isOrderable, true);
    assert.equal(status.secondsRemaining, 4500);
    assert.equal(
      status.message,
      'Lunch orders are open until 3:00 PM. You have 1h 15m left to place an order.',
    );
  });

  it('State 2: Currently open meal window with 45 minutes remaining', () => {
    // 02:15 PM in Colombo (14:15 = 51,300s) - Cutoff 15:00 (54,000s)
    // Remaining: 2,700s = 45 minutes
    const currentSeconds = 14 * 3600 + 15 * 60;
    const status = evaluateMealWindowStatus(lunchWindow, currentSeconds, 'Lunch');

    assert.equal(status.state, 'open');
    assert.equal(status.isOrderable, true);
    assert.equal(status.secondsRemaining, 2700);
    assert.equal(
      status.message,
      'Lunch orders are open until 3:00 PM. You have 45 minutes left to place an order.',
    );
  });

  it('State 3: Closed meal window (service ended / cutoff reached)', () => {
    // 11:00 AM in Colombo (39,600s) - Breakfast cutoff was 10:30 AM (37,800s)
    const currentSeconds = 11 * 3600;
    const status = evaluateMealWindowStatus(breakfastWindow, currentSeconds, 'Breakfast');

    assert.equal(status.state, 'closed');
    assert.equal(status.isOrderable, false);
    assert.equal(status.secondsRemaining, 0);
    assert.equal(
      status.message,
      'Breakfast ordering has closed for today. Please check the other menus for available options.',
    );
  });

  it('State 4: Unavailable schedule when window data is missing', () => {
    // Missing window
    const status = evaluateMealWindowStatus(undefined, 40000, 'Tea');

    assert.equal(status.state, 'unavailable');
    assert.equal(status.isOrderable, false);
    assert.equal(status.secondsRemaining, 0);
    assert.equal(
      status.message,
      "We couldn't load the ordering hours right now. Please try again.",
    );
  });

  it('never displays fabricated countdown (such as 2h 16m left) when service has ended', () => {
    const currentSeconds = 11 * 3600; // Breakfast closed
    const status = evaluateMealWindowStatus(breakfastWindow, currentSeconds, 'Breakfast');

    assert.equal(status.state, 'closed');
    assert.ok(!status.message.includes('2h 16m left'));
    assert.ok(!status.message.includes('orders close at'));
    assert.equal(
      status.message,
      'Breakfast ordering has closed for today. Please check the other menus for available options.',
    );
  });

  it('handles exact opening and cutoff boundary seconds with precision', () => {
    const startSeconds = parseTimeToSeconds('06:30:00'); // 23,400s
    const cutoffSeconds = parseTimeToSeconds('10:30:00'); // 37,800s

    // 1 second before opening: upcoming
    const beforeOpen = evaluateMealWindowStatus(breakfastWindow, startSeconds - 1, 'Breakfast');
    assert.equal(beforeOpen.state, 'upcoming');
    assert.equal(beforeOpen.isOrderable, false);

    // Exact opening second: open
    const exactOpen = evaluateMealWindowStatus(breakfastWindow, startSeconds, 'Breakfast');
    assert.equal(exactOpen.state, 'open');
    assert.equal(exactOpen.isOrderable, true);

    // 1 second before cutoff: open
    const beforeCutoff = evaluateMealWindowStatus(breakfastWindow, cutoffSeconds - 1, 'Breakfast');
    assert.equal(beforeCutoff.state, 'open');
    assert.equal(beforeCutoff.isOrderable, true);
    assert.equal(beforeCutoff.secondsRemaining, 1);

    // Exact cutoff second: closed (exclusive cutoff)
    const exactCutoff = evaluateMealWindowStatus(breakfastWindow, cutoffSeconds, 'Breakfast');
    assert.equal(exactCutoff.state, 'closed');
    assert.equal(exactCutoff.isOrderable, false);
    assert.equal(exactCutoff.secondsRemaining, 0);
  });

  it('dynamically switches message when switching between meal tabs', () => {
    // Current time: 13:00 (1:00 PM)
    // Breakfast: closed
    // Lunch: open
    // Tea: upcoming (15:00)
    // Dinner: upcoming (18:30)
    const currentSeconds = 13 * 3600;

    const b = evaluateMealWindowStatus(breakfastWindow, currentSeconds, 'Breakfast');
    const l = evaluateMealWindowStatus(lunchWindow, currentSeconds, 'Lunch');
    const t = evaluateMealWindowStatus(teaWindow, currentSeconds, 'Tea');
    const d = evaluateMealWindowStatus(
      MOCK_MEAL_WINDOWS.find((w) => w.period === 'DINNER'),
      currentSeconds,
      'Dinner',
    );

    assert.equal(b.state, 'closed');
    assert.equal(
      b.message,
      'Breakfast ordering has closed for today. Please check the other menus for available options.',
    );

    assert.equal(l.state, 'open');
    assert.equal(
      l.message,
      'Lunch orders are open until 3:00 PM. You have 2h left to place an order.',
    );

    assert.equal(t.state, 'upcoming');
    assert.equal(
      t.message,
      'Tea ordering starts at 3:00 PM. You can browse the menu in the meantime.',
    );

    assert.equal(d.state, 'upcoming');
    assert.equal(
      d.message,
      'Dinner ordering starts at 6:30 PM. You can browse the menu in the meantime.',
    );
  });
});

describe('Issue #101 Phase 4: Item Ordering Availability Rules', () => {
  const breakfastOnlyItem: GuestMenuItem = {
    id: 'item-b1',
    name: 'Eggs Benedict',
    description: 'Poached eggs on toasted brioche',
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

  const multiPeriodItem: GuestMenuItem = {
    id: 'item-m1',
    name: 'Sri Lankan Chicken Curry',
    description: 'Aromatic curry served with rice',
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
    id: 'item-so1',
    name: 'Fresh Lobster',
    description: 'Grilled local lobster',
    price: 4500,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    dietaryFlags: [],
    allergens: ['Crustaceans'],
    available: false, // Sold out
    isOrderable: true,
    isCutoff: false,
    portionCap: 2,
    imageUrl: null,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 30,
  };

  it('disables ordering for Breakfast-only item outside Breakfast hours', () => {
    // 01:00 PM (during Lunch)
    const currentSeconds = 13 * 3600;
    const canOrder = isItemCurrentlyOrderable(breakfastOnlyItem, MOCK_MEAL_WINDOWS, currentSeconds);
    const cutoff = isItemCutoff(breakfastOnlyItem, MOCK_MEAL_WINDOWS, currentSeconds);

    assert.equal(canOrder, false);
    assert.equal(cutoff, true);
  });

  it('enables ordering for Breakfast-only item during Breakfast hours', () => {
    // 08:00 AM (during Breakfast)
    const currentSeconds = 8 * 3600;
    const canOrder = isItemCurrentlyOrderable(breakfastOnlyItem, MOCK_MEAL_WINDOWS, currentSeconds);
    const cutoff = isItemCutoff(breakfastOnlyItem, MOCK_MEAL_WINDOWS, currentSeconds);

    assert.equal(canOrder, true);
    assert.equal(cutoff, false);
  });

  it('keeps multi-period item orderable during Lunch AND during Dinner, but not between them', () => {
    // 01:00 PM (during Lunch) -> orderable
    assert.equal(isItemCurrentlyOrderable(multiPeriodItem, MOCK_MEAL_WINDOWS, 13 * 3600), true);

    // 04:00 PM (between Lunch and Dinner) -> not orderable
    assert.equal(isItemCurrentlyOrderable(multiPeriodItem, MOCK_MEAL_WINDOWS, 16 * 3600), false);

    // 07:30 PM (during Dinner) -> orderable
    assert.equal(
      isItemCurrentlyOrderable(multiPeriodItem, MOCK_MEAL_WINDOWS, 19 * 3600 + 30 * 60),
      true,
    );
  });

  it('keeps ALL_DAY items orderable across meal tab transitions while all-day window is active', () => {
    // 11:00 AM (between Breakfast cutoff 10:30 and Lunch start 12:00)
    // Breakfast is closed, but ALL_DAY (06:00 to 23:00) is open!
    const currentSeconds = 11 * 3600;
    const allDayCanOrder = isItemCurrentlyOrderable(allDayItem, MOCK_MEAL_WINDOWS, currentSeconds);
    assert.equal(allDayCanOrder, true);

    // Breakfast-only item at the same moment is NOT orderable
    const breakfastCanOrder = isItemCurrentlyOrderable(
      breakfastOnlyItem,
      MOCK_MEAL_WINDOWS,
      currentSeconds,
    );
    assert.equal(breakfastCanOrder, false);
  });

  it('strictly enforces sold-out items remain unavailable regardless of meal window', () => {
    // During peak Lunch hours (13:00)
    const currentSeconds = 13 * 3600;
    const canOrder = isItemCurrentlyOrderable(soldOutItem, MOCK_MEAL_WINDOWS, currentSeconds);
    assert.equal(canOrder, false);
  });

  it('respects authoritative backend isOrderable=false and does not allow client state to bypass it', () => {
    const backendDisallowedItem: GuestMenuItem = {
      ...multiPeriodItem,
      isOrderable: false, // Backend explicitly marked as unorderable
    };

    // Even during Lunch hours, backend rejection is respected
    const canOrder = isItemCurrentlyOrderable(backendDisallowedItem, MOCK_MEAL_WINDOWS, 13 * 3600);
    assert.equal(canOrder, false);
  });
});
