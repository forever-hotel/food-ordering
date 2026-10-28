import { beforeEach, describe, expect, it } from '@jest/globals';
import { MockKmsAdapter } from '../../integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { MealPeriod } from '../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { HotelClockService } from './services/hotel-clock.service.js';
import { MealWindowService } from './services/meal-window.service.js';

describe('MenuController', () => {
  let controller: MenuController;
  let menuService: MenuService;
  let clock: HotelClockService;

  const mockGuest: GuestContext = {
    sessionId: 'session-101',
    bookingId: 'booking-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    verifiedAt: '2026-10-28T12:00:00.000Z',
    expiresAt: '2026-10-29T12:00:00.000Z',
  };

  beforeEach(() => {
    const mockKms = new MockKmsAdapter();
    clock = new HotelClockService();
    const mealWindowService = new MealWindowService(clock);
    menuService = new MenuService(mockKms, mealWindowService, clock);
    controller = new MenuController(menuService);

    // 13:00 Colombo
    clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));
  });

  it('delegates getMenu call to MenuService', async () => {
    const result = await controller.getMenu({}, mockGuest);

    expect(result.categories).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.activeMealPeriods).toContain(MealPeriod.LUNCH);
  });

  it('delegates getMealWindows call to MenuService', () => {
    const windows = controller.getMealWindows(mockGuest);

    expect(windows.length).toBe(4);
  });

  it('delegates getMenuItem call to MenuService', async () => {
    const item = await controller.getMenuItem('menu-item-001', mockGuest);

    expect(item.id).toBe('menu-item-001');
    expect(item.name).toBe('Truffle Mushroom Arancini');
  });
});
