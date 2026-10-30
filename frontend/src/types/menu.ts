export type MealPeriod = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'TEA_TIME' | 'ALL_DAY';

export interface MealWindowStatus {
  period: MealPeriod;
  name: string;
  startTime: string;
  cutoffTime: string;
  isActive: boolean;
  isCutoffReached: boolean;
  secondsRemaining: number;
}

export interface MenuItemNutrition {
  calories: number;
  proteinGrams: number;
  fatGrams: number;
}

export interface GuestMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  mealPeriods: MealPeriod[];
  available: boolean;
  isOrderable: boolean;
  isCutoff: boolean;
  secondsRemainingUntilCutoff: number;
  estimatedPrepMinutes: number;
  imageUrl: string | null;
  dietaryFlags: string[];
  allergens: string[];
  portionCap?: number;
  nutrition?: MenuItemNutrition;
}

export interface GuestMenuResponse {
  currentTimeInColombo: string;
  activeMealPeriods: MealPeriod[];
  categories: string[];
  mealWindows: MealWindowStatus[];
  items: GuestMenuItem[];
  totalItems: number;
  version: string;
}

export interface GetMenuParams {
  category?: string;
  mealPeriod?: MealPeriod;
  availableOnly?: boolean;
  search?: string;
}

export interface CartItem {
  id: string;
  item: GuestMenuItem;
  quantity: number;
  specialNotes?: string;
}
