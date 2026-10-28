import { beforeEach, describe, expect, it } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { MockKmsAdapter } from '../../integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { MealPeriod } from '../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { MenuService } from './menu.service.js';
import { HotelClockService } from './services/hotel-clock.service.js';
import { MealWindowService } from './services/meal-window.service.js';

describe('MenuService', () => {
  let mockKms: MockKmsAdapter;
  let clock: HotelClockService;
  let mealWindowService: MealWindowService;
  let service: MenuService;

  beforeEach(() => {
    mockKms = new MockKmsAdapter();
    clock = new HotelClockService();
    mealWindowService = new MealWindowService(clock);
    service = new MenuService(mockKms, mealWindowService, clock);

    // Set time to 13:00 Colombo (Lunch & All Day active)
    clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));
  });

  describe('getGuestMenu()', () => {
    it('returns full guest menu with active meal periods and categories', async () => {
      const result = await service.getGuestMenu();

      expect(result.version).toBe('1.0');
      expect(result.activeMealPeriods).toContain(MealPeriod.LUNCH);
      expect(result.activeMealPeriods).toContain(MealPeriod.ALL_DAY);
      expect(result.categories).toContain('Mains');
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.totalItems).toBe(result.items.length);

      // Verify item mapping
      const burger = result.items.find((i) => i.id === 'menu-item-002');
      expect(burger).toBeDefined();
      expect(burger?.isOrderable).toBe(true);
      expect(burger?.available).toBe(true);
    });

    it('filters items by category when category query parameter is supplied', async () => {
      const result = await service.getGuestMenu({ category: 'Starters' });

      expect(result.items.every((i) => i.category === 'Starters')).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('filters items by availableOnly when flag is set', async () => {
      const result = await service.getGuestMenu({ availableOnly: true });

      // Out of stock item 'menu-item-007' (Lobster) must NOT be present
      expect(result.items.every((i) => i.isOrderable)).toBe(true);
      expect(result.items.some((i) => i.id === 'menu-item-007')).toBe(false);
    });

    it('flags items outside active meal window as not orderable', async () => {
      // 13:00 Colombo: Breakfast item 'menu-item-004' (Eggs Benedict) is cutoff
      const result = await service.getGuestMenu();
      const eggsBenedict = result.items.find((i) => i.id === 'menu-item-004');

      expect(eggsBenedict).toBeDefined();
      expect(eggsBenedict?.available).toBe(true); // in stock in kitchen
      expect(eggsBenedict?.isOrderable).toBe(false); // but outside meal window
      expect(eggsBenedict?.isCutoff).toBe(true);
    });

    it('propagates upstream KMS exceptions safely without fabricating entries', async () => {
      mockKms.setSimulateDown(true);

      await expect(service.getGuestMenu()).rejects.toThrow();
    });
  });

  describe('getItemById()', () => {
    it('retrieves detailed menu item by id', async () => {
      const item = await service.getItemById('menu-item-001');

      expect(item.id).toBe('menu-item-001');
      expect(item.name).toBe('Truffle Mushroom Arancini');
      expect(item.allergens).toContain('Dairy');
    });

    it('throws NotFoundException when menu item id does not exist', async () => {
      await expect(service.getItemById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMealWindows()', () => {
    it('returns all configured meal window schedules', () => {
      const windows = service.getMealWindows();

      expect(windows.length).toBe(4);
      expect(windows.map((w) => w.period)).toEqual([
        MealPeriod.BREAKFAST,
        MealPeriod.LUNCH,
        MealPeriod.DINNER,
        MealPeriod.ALL_DAY,
      ]);
    });
  });
});
