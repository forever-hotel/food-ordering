import type { GuestMenuItem, MealPeriod, MealWindowStatus } from '../../types/menu.ts';

export const COLOMBO_TIMEZONE = 'Asia/Colombo';

export type CategoryKey = 'Breakfast' | 'Lunch' | 'Dinner' | 'Tea';

/**
 * Authoritative category to meal period mapping.
 * Tea is strictly mapped to TEA_TIME.
 * ALL_DAY is a separate item availability classification and must never substitute for Tea.
 */
export const CATEGORY_PERIOD_MAP: Record<CategoryKey, MealPeriod> = {
  Breakfast: 'BREAKFAST',
  Lunch: 'LUNCH',
  Dinner: 'DINNER',
  Tea: 'TEA_TIME',
};

export type MealWindowState = 'open' | 'upcoming' | 'closed' | 'unavailable';

export interface MealWindowEvaluation {
  state: MealWindowState;
  period?: MealPeriod;
  name?: string;
  startTime?: string;
  cutoffTime?: string;
  secondsRemaining: number;
  isOrderable: boolean;
  message: string;
}

/**
 * Parse an 'HH:mm:ss' or 'HH:mm' string into total seconds of the day.
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  const hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  const seconds = Number.isFinite(parts[2]) ? parts[2] : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format an 'HH:mm:ss' or 'HH:mm' string into readable 12-hour format with AM/PM.
 * e.g., "06:30:00" -> "6:30 AM", "14:30:00" -> "2:30 PM", "15:00" -> "3:00 PM".
 */
export function formatTime12Hour(timeStr?: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  let hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minsFormatted = minutes.toString().padStart(2, '0');
  return `${hours}:${minsFormatted} ${ampm}`;
}

/**
 * Formats seconds remaining into clean, positive conversational countdown.
 * e.g. 4500s -> "1h 15m", 2700s -> "45 minutes", 60s -> "1 minute", <60s -> "less than a minute".
 * Never returns negative strings or raw technical counters.
 */
export function formatRemainingTime(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return '0 minutes';
  const totalMinutes = Math.floor(secondsRemaining / 60);
  if (totalMinutes === 0) return 'less than a minute';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Computes the exact hours, minutes, seconds, and total seconds of the day in Asia/Colombo.
 * Works deterministically regardless of the host machine's local timezone.
 */
export function getColomboTime(date: Date = new Date()): {
  hours: number;
  minutes: number;
  seconds: number;
  totalSecondsOfDay: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: COLOMBO_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  for (const part of parts) {
    if (part.type === 'hour') hours = parseInt(part.value, 10);
    if (part.type === 'minute') minutes = parseInt(part.value, 10);
    if (part.type === 'second') seconds = parseInt(part.value, 10);
  }

  // Handle potential 24 in some ICU implementations
  if (hours === 24) hours = 0;

  const totalSecondsOfDay = hours * 3600 + minutes * 60 + seconds;
  return { hours, minutes, seconds, totalSecondsOfDay };
}

/**
 * Generate human-friendly guest message based on window evaluation.
 */
export function getMealWindowGuestMessage(
  periodLabel: string,
  state: MealWindowState,
  startTime?: string,
  cutoffTime?: string,
  secondsRemaining = 0,
): string {
  switch (state) {
    case 'unavailable':
      return "We couldn't load the ordering hours right now. Please try again.";
    case 'upcoming':
      return `${periodLabel} ordering starts at ${formatTime12Hour(startTime)}. You can browse the menu in the meantime.`;
    case 'open':
      return `${periodLabel} orders are open until ${formatTime12Hour(cutoffTime)}. You have ${formatRemainingTime(secondsRemaining)} left to place an order.`;
    case 'closed':
      return `${periodLabel} ordering has closed for today. Please check the other menus for available options.`;
  }
}

/**
 * Evaluates the status of a specific meal window against current Colombo seconds.
 * Inclusive start, exclusive cutoff:
 * Active when: startSeconds <= currentSeconds < cutoffSeconds
 */
export function evaluateMealWindowStatus(
  window?: MealWindowStatus,
  colomboSeconds?: number,
  periodLabel?: string,
): MealWindowEvaluation {
  const label = periodLabel || window?.name || 'Meal';

  if (!window || !window.startTime || !window.cutoffTime) {
    return {
      state: 'unavailable',
      secondsRemaining: 0,
      isOrderable: false,
      message: getMealWindowGuestMessage(label, 'unavailable'),
    };
  }

  const currentSeconds =
    typeof colomboSeconds === 'number' ? colomboSeconds : getColomboTime().totalSecondsOfDay;

  const startSeconds = parseTimeToSeconds(window.startTime);
  const cutoffSeconds = parseTimeToSeconds(window.cutoffTime);

  // Inclusive start, exclusive cutoff
  if (currentSeconds < startSeconds) {
    return {
      state: 'upcoming',
      period: window.period,
      name: window.name,
      startTime: window.startTime,
      cutoffTime: window.cutoffTime,
      secondsRemaining: 0,
      isOrderable: false,
      message: getMealWindowGuestMessage(label, 'upcoming', window.startTime, window.cutoffTime, 0),
    };
  }

  if (currentSeconds >= cutoffSeconds) {
    return {
      state: 'closed',
      period: window.period,
      name: window.name,
      startTime: window.startTime,
      cutoffTime: window.cutoffTime,
      secondsRemaining: 0,
      isOrderable: false,
      message: getMealWindowGuestMessage(label, 'closed', window.startTime, window.cutoffTime, 0),
    };
  }

  const secondsRemaining = Math.max(0, cutoffSeconds - currentSeconds);
  return {
    state: 'open',
    period: window.period,
    name: window.name,
    startTime: window.startTime,
    cutoffTime: window.cutoffTime,
    secondsRemaining,
    isOrderable: true,
    message: getMealWindowGuestMessage(
      label,
      'open',
      window.startTime,
      window.cutoffTime,
      secondsRemaining,
    ),
  };
}

/**
 * Determines whether an item can currently be ordered.
 *
 * Rules:
 * 1. Sold-out items (available === false) are never orderable.
 * 2. Backend orderability validation is authoritative: if item.isOrderable === false, do not allow ordering.
 * 3. If item.isCutoff === true, do not allow ordering.
 * 4. If meal windows are available, check if ANY valid meal period for the item (or ALL_DAY) is currently open.
 *    An item is not disabled merely because one of its periods closed if another period (e.g. ALL_DAY) is open.
 * 5. If client clock has passed the cutoff for all of the item's meal periods, client disables ordering.
 */
export function isItemCurrentlyOrderable(
  item: GuestMenuItem,
  mealWindows?: MealWindowStatus[],
  colomboSeconds?: number,
): boolean {
  if (!item.available) return false;
  if (!item.isOrderable) return false;
  if (item.isCutoff) return false;

  // If no windows provided, rely on backend item-level flags
  if (!mealWindows || mealWindows.length === 0) {
    return true;
  }

  const itemPeriods = item.mealPeriods || [];
  if (itemPeriods.length === 0) {
    return true;
  }

  const currentSeconds =
    typeof colomboSeconds === 'number' ? colomboSeconds : getColomboTime().totalSecondsOfDay;

  // Check if at least one applicable meal period is currently open
  const hasActivePeriod = itemPeriods.some((period) => {
    const win = mealWindows.find((w) => w.period === period);
    if (!win) {
      // If ALL_DAY window isn't explicitly defined, assume standard 06:00 to 23:00
      if (period === 'ALL_DAY') {
        return currentSeconds >= 6 * 3600 && currentSeconds < 23 * 3600;
      }
      return false;
    }
    const evalStatus = evaluateMealWindowStatus(win, currentSeconds);
    return evalStatus.state === 'open';
  });

  return hasActivePeriod;
}

/**
 * Determines whether an item's ordering window has reached cutoff.
 */
export function isItemCutoff(
  item: GuestMenuItem,
  mealWindows?: MealWindowStatus[],
  colomboSeconds?: number,
): boolean {
  if (!item.available) return false; // Sold out is handled separately
  if (item.isCutoff) return true;
  if (!item.isOrderable) return true;

  if (!mealWindows || mealWindows.length === 0) {
    return false;
  }

  const itemPeriods = item.mealPeriods || [];
  if (itemPeriods.length === 0) {
    return false;
  }

  // If ANY applicable period is still open or upcoming, it's not strictly past all cutoffs
  return !isItemCurrentlyOrderable(item, mealWindows, colomboSeconds);
}
