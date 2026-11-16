import type { MenuProvider } from '../interfaces.ts';
import type { GuestMenuResponse, GuestMenuItem, GetMenuParams } from '../../../types/menu.ts';
import { DemoStateStore } from './demo-state-store.ts';

export class DemoMenuProvider implements MenuProvider {
  private readonly store = DemoStateStore.getInstance();

  async fetchGuestMenu(_sessionToken?: string, params?: GetMenuParams): Promise<GuestMenuResponse> {
    const catalog = this.store.getMenuCatalog();
    let filteredItems = catalog.items;

    if (params?.category) {
      filteredItems = filteredItems.filter(
        (i) => i.category.toLowerCase() === params.category!.toLowerCase(),
      );
    }

    if (params?.mealPeriod) {
      filteredItems = filteredItems.filter(
        (i) => i.mealPeriods.includes(params.mealPeriod!) || i.mealPeriods.includes('ALL_DAY'),
      );
    }

    if (params?.availableOnly) {
      filteredItems = filteredItems.filter((i) => i.available && !i.isCutoff);
    }

    if (params?.search) {
      const q = params.search.toLowerCase();
      filteredItems = filteredItems.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)),
      );
    }

    return {
      ...catalog,
      items: filteredItems,
      totalItems: filteredItems.length,
    };
  }

  async fetchGuestMenuItem(itemId: string, _sessionToken?: string): Promise<GuestMenuItem | null> {
    void _sessionToken;
    return this.store.getMenuItemById(itemId);
  }
}
