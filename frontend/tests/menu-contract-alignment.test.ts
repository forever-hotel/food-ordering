import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GuestMenuItem, GuestMenuResponse } from '../src/types/menu.ts';

describe('Regression Tests: Menu Contract Alignment Between KMS Course Categories and Meal Period Windows (#101, FUI-05)', () => {
  // Real KMS Fixture Catalog items with course categories and meal periods
  const mockKmsCatalog: GuestMenuResponse = {
    currentTimeInColombo: '2026-11-02T12:30:00.000Z',
    activeMealPeriods: ['LUNCH'],
    categories: ['Starters', 'Mains', 'Desserts', 'Beverages'],
    mealWindows: [
      {
        period: 'BREAKFAST',
        name: 'Breakfast',
        startTime: '06:30:00',
        cutoffTime: '10:30:00',
        isActive: false,
        isCutoffReached: true,
        secondsRemaining: 0,
      },
      {
        period: 'LUNCH',
        name: 'Lunch',
        startTime: '11:30:00',
        cutoffTime: '14:30:00',
        isActive: true,
        isCutoffReached: false,
        secondsRemaining: 7200,
      },
      {
        period: 'DINNER',
        name: 'Dinner',
        startTime: '18:30:00',
        cutoffTime: '22:30:00',
        isActive: false,
        isCutoffReached: false,
        secondsRemaining: 21600,
      },
      {
        period: 'ALL_DAY',
        name: 'Tea & Snacks',
        startTime: '06:00:00',
        cutoffTime: '23:00:00',
        isActive: true,
        isCutoffReached: false,
        secondsRemaining: 37800,
      },
    ],
    items: [
      {
        id: 'menu-item-001',
        name: 'Truffle Mushroom Arancini',
        description: 'Crispy risotto spheres with truffle',
        price: 18.0,
        category: 'Starters',
        mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
        available: true,
        isOrderable: true,
        isCutoff: false,
        secondsRemainingUntilCutoff: 7200,
        estimatedPrepMinutes: 15,
        imageUrl: null,
        dietaryFlags: ['VEGETARIAN'],
        allergens: ['Dairy', 'Gluten'],
      },
      {
        id: 'menu-item-002',
        name: 'Signature Wagyu Burger',
        description: 'Flame-grilled wagyu patty with aged cheddar',
        price: 32.5,
        category: 'Mains',
        mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
        available: true,
        isOrderable: true,
        isCutoff: false,
        secondsRemainingUntilCutoff: 7200,
        estimatedPrepMinutes: 20,
        imageUrl: null,
        dietaryFlags: [],
        allergens: ['Dairy', 'Gluten'],
      },
      {
        id: 'menu-item-003',
        name: 'Wild Atlantic Salmon',
        description: 'Pan-seared salmon fillet over saffron puree',
        price: 36.0,
        category: 'Mains',
        mealPeriods: ['DINNER'],
        available: true,
        isOrderable: false,
        isCutoff: false,
        secondsRemainingUntilCutoff: 21600,
        estimatedPrepMinutes: 25,
        imageUrl: null,
        dietaryFlags: ['GLUTEN_FREE'],
        allergens: ['Fish'],
      },
      {
        id: 'menu-item-004',
        name: 'Classic Eggs Benedict',
        description: 'Poached free-range eggs on toasted brioche',
        price: 22.0,
        category: 'Mains',
        mealPeriods: ['BREAKFAST'],
        available: true,
        isOrderable: false,
        isCutoff: true,
        secondsRemainingUntilCutoff: 0,
        estimatedPrepMinutes: 15,
        imageUrl: null,
        dietaryFlags: [],
        allergens: ['Eggs', 'Dairy', 'Gluten'],
      },
      {
        id: 'menu-item-005',
        name: 'Ceylon Milk Tea',
        description: 'Traditional spiced Ceylon tea with sweetened milk',
        price: 5.0,
        category: 'Beverages',
        mealPeriods: ['ALL_DAY', 'TEA_TIME'],
        available: true,
        isOrderable: true,
        isCutoff: false,
        secondsRemainingUntilCutoff: 37800,
        estimatedPrepMinutes: 5,
        imageUrl: null,
        dietaryFlags: ['VEGETARIAN'],
        allergens: ['Dairy'],
      },
      // Legacy fixture item directly tagged with meal period
      {
        id: 'item-101',
        name: 'Grilled Chicken Rice',
        description: 'Herb marinated grilled chicken breast',
        price: 850,
        category: 'Lunch',
        mealPeriods: ['LUNCH', 'DINNER'],
        available: true,
        isOrderable: true,
        isCutoff: false,
        secondsRemainingUntilCutoff: 7200,
        estimatedPrepMinutes: 20,
        imageUrl: null,
        dietaryFlags: [],
        allergens: [],
      },
    ],
    totalItems: 6,
    version: '1.0',
  };

  function filterItems(
    items: GuestMenuItem[],
    selectedMealTab: 'Breakfast' | 'Lunch' | 'Dinner' | 'Tea',
    selectedCourse = 'All',
  ): GuestMenuItem[] {
    const categoryPeriodMap: Record<string, string> = {
      Breakfast: 'BREAKFAST',
      Lunch: 'LUNCH',
      Dinner: 'DINNER',
      Tea: 'ALL_DAY',
    };
    const targetPeriod = categoryPeriodMap[selectedMealTab] || 'ALL_DAY';

    return items.filter((item) => {
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
        item.category.toLowerCase() === selectedMealTab.toLowerCase() ||
        (selectedMealTab === 'Tea' &&
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
  }

  it('correctly displays KMS items under Lunch tab even though their categories are Starters and Mains', () => {
    const lunchItems = filterItems(mockKmsCatalog.items, 'Lunch');
    const itemNames = lunchItems.map((i) => i.name);

    assert.ok(
      itemNames.includes('Truffle Mushroom Arancini'),
      'Arancini (Starters) must appear under Lunch',
    );
    assert.ok(
      itemNames.includes('Signature Wagyu Burger'),
      'Wagyu Burger (Mains) must appear under Lunch',
    );
    assert.ok(itemNames.includes('Ceylon Milk Tea'), 'All Day tea must appear under Lunch');
    assert.ok(
      itemNames.includes('Grilled Chicken Rice'),
      'Legacy lunch category item must appear under Lunch',
    );
    assert.ok(
      !itemNames.includes('Classic Eggs Benedict'),
      'Breakfast item must not appear under Lunch',
    );
    assert.ok(
      !itemNames.includes('Wild Atlantic Salmon'),
      'Dinner-only salmon must not appear under Lunch',
    );
  });

  it('correctly displays KMS items under Breakfast tab', () => {
    const breakfastItems = filterItems(mockKmsCatalog.items, 'Breakfast');
    const itemNames = breakfastItems.map((i) => i.name);

    assert.ok(
      itemNames.includes('Classic Eggs Benedict'),
      'Eggs Benedict must appear under Breakfast',
    );
    assert.ok(
      itemNames.includes('Ceylon Milk Tea'),
      'All Day beverage must appear under Breakfast',
    );
    assert.ok(
      !itemNames.includes('Wild Atlantic Salmon'),
      'Dinner salmon must not appear under Breakfast',
    );
  });

  it('correctly displays KMS items under Dinner tab', () => {
    const dinnerItems = filterItems(mockKmsCatalog.items, 'Dinner');
    const itemNames = dinnerItems.map((i) => i.name);

    assert.ok(itemNames.includes('Wild Atlantic Salmon'), 'Dinner salmon must appear under Dinner');
    assert.ok(
      itemNames.includes('Signature Wagyu Burger'),
      'All-day/dinner burger must appear under Dinner',
    );
    assert.ok(itemNames.includes('Truffle Mushroom Arancini'), 'Arancini must appear under Dinner');
    assert.ok(
      !itemNames.includes('Classic Eggs Benedict'),
      'Breakfast item must not appear under Dinner',
    );
  });

  it('supports course category filtering (Starters vs Mains) within Lunch meal period', () => {
    const lunchStarters = filterItems(mockKmsCatalog.items, 'Lunch', 'Starters');
    assert.equal(lunchStarters.length, 1);
    assert.equal(lunchStarters[0].name, 'Truffle Mushroom Arancini');

    const lunchMains = filterItems(mockKmsCatalog.items, 'Lunch', 'Mains');
    assert.equal(lunchMains.length, 1);
    assert.equal(lunchMains[0].name, 'Signature Wagyu Burger');
  });

  it('displays empty state gracefully when no items match course filter in that period', () => {
    const lunchDesserts = filterItems(mockKmsCatalog.items, 'Lunch', 'Desserts');
    assert.equal(lunchDesserts.length, 0, 'No desserts in mock catalog for lunch');
  });
});
