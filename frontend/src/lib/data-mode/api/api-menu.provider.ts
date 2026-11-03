import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { MenuProvider } from '../interfaces.ts';
import type { GuestMenuResponse, GuestMenuItem, GetMenuParams } from '../../../types/menu.ts';

export class ApiMenuProvider implements MenuProvider {
  async fetchGuestMenu(sessionToken?: string, params?: GetMenuParams): Promise<GuestMenuResponse> {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.mealPeriod) query.set('mealPeriod', params.mealPeriod);
    if (params?.availableOnly) query.set('availableOnly', 'true');
    if (params?.search) query.set('search', params.search);

    const queryString = query.toString();
    const endpoint = `${API_URL}/menu${queryString ? `?${queryString}` : ''}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = body?.message || body?.error || 'Failed to fetch menu items.';
        throw new ApiError(errorMsg, response.status, body);
      }

      return body as GuestMenuResponse;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to menu service.';
      throw new ApiError(msg, 503);
    }
  }

  async fetchGuestMenuItem(itemId: string, sessionToken?: string): Promise<GuestMenuItem | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    try {
      const response = await fetch(`${API_URL}/menu/items/${encodeURIComponent(itemId)}`, {
        method: 'GET',
        headers,
      });

      if (response.status === 404) {
        return null;
      }

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = body?.message || body?.error || `Item ${itemId} not found.`;
        throw new ApiError(errorMsg, response.status, body);
      }

      return body as GuestMenuItem;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Unable to fetch menu item details.';
      throw new ApiError(msg, 503);
    }
  }
}
