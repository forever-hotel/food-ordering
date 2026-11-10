import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MockKmsAdapter } from '../../integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { MealPeriod } from '../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { RedisService } from '../../redis/redis.service.js';
import { MenuService } from './menu.service.js';
import { HotelClockService } from './services/hotel-clock.service.js';
import { MealWindowService } from './services/meal-window.service.js';

describe('MenuService', () => {
  let mockKms: MockKmsAdapter;
  let clock: HotelClockService;
  let mealWindowService: MealWindowService;
  let mockRedis: RedisService;
  let service: MenuService;

  beforeEach(() => {
    mockKms = new MockKmsAdapter();
    clock = new HotelClockService();
    mealWindowService = new MealWindowService(clock);

    const store = new Map<string, unknown>();
    mockRedis = {
      get: jest.fn(async (key: string) => (store.get(key) as unknown) || null),
      set: jest.fn(async (key: string, val: unknown) => {
        store.set(key, val);
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      flushPattern: jest.fn(async (prefix: string) => {
        for (const k of store.keys()) {
          if (k.startsWith(prefix.replace('*', ''))) {
            store.delete(k);
          }
        }
      }),
    } as unknown as RedisService;

    service = new MenuService(mockKms, mealWindowService, clock, mockRedis);

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

  describe('caching behavior', () => {
    it('caches KMS catalog on first call and serves subsequent requests from cache', async () => {
      const kmsSpy = jest.spyOn(mockKms, 'getMenuCatalog');

      // First call: cache miss, calls KMS
      const firstResult = await service.getGuestMenu();
      expect(firstResult.items.length).toBeGreaterThan(0);
      expect(kmsSpy).toHaveBeenCalledTimes(1);

      // Second call: cache hit, serves from cache without querying KMS again
      const secondResult = await service.getGuestMenu();
      expect(secondResult.items.length).toBe(firstResult.items.length);
      expect(kmsSpy).toHaveBeenCalledTimes(1);
    });

    it('re-queries KMS after invalidateMenuCache()', async () => {
      const kmsSpy = jest.spyOn(mockKms, 'getMenuCatalog');

      await service.getGuestMenu();
      expect(kmsSpy).toHaveBeenCalledTimes(1);

      await service.invalidateMenuCache();

      await service.getGuestMenu();
      expect(kmsSpy).toHaveBeenCalledTimes(2);
    });

    it('bypasses redis catalog cache when SHARED_DATABASE_MODE is true', async () => {
      const mockConfig = {
        get: jest.fn((key: string) =>
          key === 'SHARED_DATABASE_MODE' ? 'true' : null,
        ),
      } as unknown as ConfigService;
      const unsharedService = new MenuService(
        mockKms,
        mealWindowService,
        clock,
        mockRedis,
        mockConfig,
      );
      const menu = await unsharedService.getGuestMenu();
      expect(menu.items.length).toBeGreaterThan(0);
    });

    it('serves getItemById from cache when cached catalog exists', async () => {
      await service.getGuestMenu();
      const item = await service.getItemById('menu-item-001');
      expect(item.id).toBe('menu-item-001');
    });

    it('handles invalidateMenuCache gracefully when redis is not configured', async () => {
      const serviceNoRedis = new MenuService(
        mockKms,
        mealWindowService,
        clock,
        undefined,
      );
      await expect(
        serviceNoRedis.invalidateMenuCache(),
      ).resolves.toBeUndefined();
    });

    it('evaluates item with specific orderingWindow and updates mealWindows', async () => {
      const windowItem = {
        id: 'menu-item-windowed',
        name: 'Late Night Snack',
        category: 'Snacks',
        price: 15,
        available: true,
        mealPeriods: [MealPeriod.ALL_DAY],
        orderingWindow: {
          startTime: '22:00',
          cutoffTime: '02:00',
        },
      };
      jest.spyOn(mockKms, 'getMenuCatalog').mockResolvedValueOnce({
        version: '1.0',
        items: [windowItem as any],
      });

      const menu = await service.getGuestMenu();
      expect(menu.items.length).toBe(1);
      expect(menu.mealWindows.length).toBe(1);
    });

    it('handles empty active meal periods and logs None', async () => {
      jest
        .spyOn(mealWindowService, 'getActiveMealPeriods')
        .mockReturnValueOnce([]);
      const menu = await service.getGuestMenu();
      expect(menu.activeMealPeriods).toEqual([]);
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

  it('passes the kitchen ordering pause to the guest window and item', async () => {
    const catalog = await mockKms.getMenuCatalog();
    const item = {
      ...catalog.items[0],
      portionLimit: 3,
      mealPeriods: [MealPeriod.LUNCH],
      orderingWindow: {
        startTime: '10:00:00',
        cutoffTime: '15:00:00',
        enabled: false,
      },
    };
    jest
      .spyOn(mockKms, 'getMenuCatalog')
      .mockResolvedValueOnce({ ...catalog, items: [item] });
    const result = await service.getGuestMenu();
    expect(result.mealWindows[0]).toMatchObject({
      period: MealPeriod.LUNCH,
      enabled: false,
      isActive: false,
    });
    expect(result.items[0].isOrderable).toBe(false);
    expect(result.items[0].portionCap).toBe(3);
  });
});
