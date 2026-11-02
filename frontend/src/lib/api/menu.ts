import API_URL from './config.ts';
import { ApiError } from './guest-sessions.ts';
import type {
  GetMenuParams,
  GuestMenuItem,
  GuestMenuResponse,
  MealWindowStatus,
} from '../../types/menu.ts';
import { getMenuProvider } from '../data-mode/provider-factory.ts';

export const FALLBACK_MENU_RESPONSE: GuestMenuResponse = {
  currentTimeInColombo: '2026-10-30 12:14:00',
  activeMealPeriods: ['LUNCH', 'ALL_DAY'],
  categories: ['Breakfast', 'Lunch', 'Dinner', 'Tea'],
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
      secondsRemaining: 8160, // 2h 16m left per Figure 32
    },
    {
      period: 'DINNER',
      name: 'Dinner',
      startTime: '18:00:00',
      cutoffTime: '22:30:00',
      isActive: false,
      isCutoffReached: false,
      secondsRemaining: 20760,
    },
    {
      period: 'TEA_TIME',
      name: 'Tea & Snacks',
      startTime: '15:00:00',
      cutoffTime: '17:30:00',
      isActive: false,
      isCutoffReached: false,
      secondsRemaining: 9960,
    },
  ],
  items: [
    {
      id: 'item-101',
      name: 'Grilled Chicken Rice',
      description:
        'Char-grilled chicken breast, steamed jasmine rice, house salad with lemon dressing. Served hot to your room.',
      price: 850,
      category: 'Lunch',
      mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
      available: true,
      isOrderable: true,
      isCutoff: false,
      secondsRemainingUntilCutoff: 8160,
      estimatedPrepMinutes: 20,
      imageUrl: 'https://cdn.foreverhotel.com/menu/grilled-chicken-rice.webp',
      dietaryFlags: ['Gluten-free', 'High protein', 'Dairy-free'],
      allergens: [],
      portionCap: 3,
    },
    {
      id: 'item-102',
      name: 'Vegetable Kottu',
      description:
        'Shredded godamba roti, freshly chopped garden vegetables, farm egg, and fragrant island spices.',
      price: 650,
      category: 'Lunch',
      mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
      available: true,
      isOrderable: true,
      isCutoff: false,
      secondsRemainingUntilCutoff: 8160,
      estimatedPrepMinutes: 15,
      imageUrl: 'https://cdn.foreverhotel.com/menu/vegetable-kottu.webp',
      dietaryFlags: ['Vegan option'],
      allergens: ['Gluten'],
      portionCap: 4,
    },
    {
      id: 'item-103',
      name: 'Prawn Noodles',
      description:
        'Wok-tossed egg noodles, tender ocean prawns, spring onions, pak choi, and aromatic shellfish glaze.',
      price: 950,
      category: 'Lunch',
      mealPeriods: ['LUNCH', 'DINNER'],
      available: false,
      isOrderable: false,
      isCutoff: false,
      secondsRemainingUntilCutoff: 8160,
      estimatedPrepMinutes: 20,
      imageUrl: 'https://cdn.foreverhotel.com/menu/prawn-noodles.webp',
      dietaryFlags: [],
      allergens: ['Shellfish', 'Gluten', 'Eggs'],
      portionCap: 2,
    },
    {
      id: 'item-104',
      name: 'Classic Eggs Benedict',
      description:
        'Two poached free-range eggs on toasted brioche with smoked chicken ham and warm golden hollandaise sauce.',
      price: 720,
      category: 'Breakfast',
      mealPeriods: ['BREAKFAST'],
      available: true,
      isOrderable: false, // Breakfast cutoff reached in lunch window
      isCutoff: true,
      secondsRemainingUntilCutoff: 0,
      estimatedPrepMinutes: 15,
      imageUrl: 'https://cdn.foreverhotel.com/menu/eggs-benedict.webp',
      dietaryFlags: ['High protein'],
      allergens: ['Eggs', 'Dairy', 'Gluten'],
      portionCap: 3,
    },
    {
      id: 'item-105',
      name: 'Sri Lankan Egg Hoppers (2 Pcs)',
      description:
        'Crispy-edged bowl pancakes with soft steamed center topped with organic egg, served with spicy seeni sambol.',
      price: 480,
      category: 'Breakfast',
      mealPeriods: ['BREAKFAST'],
      available: true,
      isOrderable: false,
      isCutoff: true,
      secondsRemainingUntilCutoff: 0,
      estimatedPrepMinutes: 12,
      imageUrl: 'https://cdn.foreverhotel.com/menu/egg-hoppers.webp',
      dietaryFlags: ['Vegetarian', 'Gluten-free'],
      allergens: ['Eggs'],
      portionCap: 4,
    },
    {
      id: 'item-106',
      name: 'Wild Atlantic Salmon Fillet',
      description:
        'Pan-seared salmon fillet over saffron cauliflower puree, roasted baby asparagus, and lemon butter sauce.',
      price: 1850,
      category: 'Dinner',
      mealPeriods: ['DINNER'],
      available: true,
      isOrderable: true,
      isCutoff: false,
      secondsRemainingUntilCutoff: 20760,
      estimatedPrepMinutes: 25,
      imageUrl: 'https://cdn.foreverhotel.com/menu/salmon.webp',
      dietaryFlags: ['Gluten-free', 'Keto', 'High protein'],
      allergens: ['Fish', 'Dairy'],
      portionCap: 2,
    },
    {
      id: 'item-107',
      name: 'Ceylon High-Grown Tea with Shortbread',
      description:
        'Freshly brewed single-origin Nuwara Eliya black tea served with homemade butter shortbread cookies.',
      price: 350,
      category: 'Tea',
      mealPeriods: ['TEA_TIME', 'ALL_DAY'],
      available: true,
      isOrderable: true,
      isCutoff: false,
      secondsRemainingUntilCutoff: 9960,
      estimatedPrepMinutes: 8,
      imageUrl: 'https://cdn.foreverhotel.com/menu/ceylon-tea.webp',
      dietaryFlags: ['Vegetarian'],
      allergens: ['Dairy', 'Gluten'],
      portionCap: 4,
    },
  ],
  totalItems: 7,
  version: '1.0',
};

/**
 * Validates image URL scheme to ensure safety against javascript: or invalid schemes.
 */
export function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export { formatLkrPrice } from '../utils/money.ts';

/**
 * Fetches the active menu catalog with meal windows and items from FOSS API.
 */
export async function fetchGuestMenu(
  sessionToken?: string,
  params?: GetMenuParams,
): Promise<GuestMenuResponse> {
  return getMenuProvider().fetchGuestMenu(sessionToken, params);
}

/**
 * Fetches single menu item detail by ID.
 */
export async function fetchMenuItem(sessionToken: string, itemId: string): Promise<GuestMenuItem> {
  const item = await getMenuProvider().fetchGuestMenuItem(itemId, sessionToken);
  if (!item) {
    throw new ApiError(`Item ${itemId} not found.`, 404);
  }
  return item;
}

/**
 * Fetches meal window schedules and cutoff states.
 */
export async function fetchMealWindows(sessionToken: string): Promise<MealWindowStatus[]> {
  try {
    const response = await fetch(`${API_URL}/menu/windows`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(body?.message || 'Failed to fetch meal windows', response.status);
    }

    return body as MealWindowStatus[];
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : 'Unable to retrieve meal windows.';
    throw new ApiError(msg, 503);
  }
}
