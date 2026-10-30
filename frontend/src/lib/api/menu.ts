import API_URL from './config.ts';
import { ApiError } from './guest-sessions.ts';
import type {
  GetMenuParams,
  GuestMenuItem,
  GuestMenuResponse,
  MealWindowStatus,
} from '../../types/menu.ts';

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
      imageUrl:
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['Gluten-free', 'High protein', 'Dairy-free'],
      allergens: [],
      portionCap: 3,
      nutrition: {
        calories: 420,
        proteinGrams: 38,
        fatGrams: 12,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['Vegan option'],
      allergens: ['Gluten'],
      portionCap: 4,
      nutrition: {
        calories: 510,
        proteinGrams: 18,
        fatGrams: 14,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: [],
      allergens: ['Shellfish', 'Gluten', 'Eggs'],
      portionCap: 2,
      nutrition: {
        calories: 580,
        proteinGrams: 32,
        fatGrams: 16,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['High protein'],
      allergens: ['Eggs', 'Dairy', 'Gluten'],
      portionCap: 3,
      nutrition: {
        calories: 460,
        proteinGrams: 24,
        fatGrams: 28,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['Vegetarian', 'Gluten-free'],
      allergens: ['Eggs'],
      portionCap: 4,
      nutrition: {
        calories: 340,
        proteinGrams: 14,
        fatGrams: 10,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['Gluten-free', 'Keto', 'High protein'],
      allergens: ['Fish', 'Dairy'],
      portionCap: 2,
      nutrition: {
        calories: 520,
        proteinGrams: 44,
        fatGrams: 22,
      },
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
      imageUrl:
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80',
      dietaryFlags: ['Vegetarian'],
      allergens: ['Dairy', 'Gluten'],
      portionCap: 4,
      nutrition: {
        calories: 180,
        proteinGrams: 4,
        fatGrams: 8,
      },
    },
  ],
  totalItems: 7,
  version: '1.0',
};

/**
 * Formats a currency amount into Sri Lankan Rupee (LKR) display text.
 */
export function formatLkrPrice(price: number): string {
  return `LKR ${price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Fetches the active menu catalog with meal windows and items from FOSS API.
 */
export async function fetchGuestMenu(
  sessionToken: string,
  params?: GetMenuParams,
): Promise<GuestMenuResponse> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.mealPeriod) query.set('mealPeriod', params.mealPeriod);
  if (params?.availableOnly) query.set('availableOnly', 'true');
  if (params?.search) query.set('search', params.search);

  const queryString = query.toString() ? `?${query.toString()}` : '';

  try {
    const response = await fetch(`${API_URL}/menu${queryString}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Failed to retrieve menu catalog.';
      throw new ApiError(errorMsg, response.status, body);
    }

    // Merge nutrition and portion caps if backend items omit them
    const enrichedItems = (body.items || []).map((item: GuestMenuItem) => {
      const fallback = FALLBACK_MENU_RESPONSE.items.find(
        (f) => f.id === item.id || f.name.toLowerCase() === item.name.toLowerCase(),
      );
      return {
        ...item,
        portionCap: item.portionCap || fallback?.portionCap || 3,
        nutrition: item.nutrition ||
          fallback?.nutrition || {
            calories: 420,
            proteinGrams: 30,
            fatGrams: 14,
          },
      };
    });

    return {
      ...body,
      items: enrichedItems,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Fallback to deterministic mock data when server is in demo/offline mode
    return FALLBACK_MENU_RESPONSE;
  }
}

/**
 * Fetches single menu item detail by ID.
 */
export async function fetchMenuItem(sessionToken: string, itemId: string): Promise<GuestMenuItem> {
  try {
    const response = await fetch(`${API_URL}/menu/items/${itemId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = body?.message || 'Failed to retrieve menu item details.';
      throw new ApiError(errorMsg, response.status, body);
    }

    const fallback = FALLBACK_MENU_RESPONSE.items.find((f) => f.id === itemId);
    return {
      ...body,
      portionCap: body.portionCap || fallback?.portionCap || 3,
      nutrition: body.nutrition ||
        fallback?.nutrition || {
          calories: 420,
          proteinGrams: 30,
          fatGrams: 14,
        },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const fallback = FALLBACK_MENU_RESPONSE.items.find((f) => f.id === itemId);
    if (fallback) {
      return fallback;
    }
    throw new ApiError('Item not found', 404);
  }
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
    return FALLBACK_MENU_RESPONSE.mealWindows;
  }
}
