import type { GuestMenuItem, MealPeriod, MealWindowStatus } from '../../types/menu.ts';

export const COLOMBO_TIMEZONE = 'Asia/Colombo';

export type CategoryKey = 'Breakfast' | 'Lunch' | 'Dinner' | 'Tea';

/**
 * Authoritative category to meal period mapping.
 * Tea maps to TEA_TIME.
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

export interface OrderableEvaluationOptions {
  isDemoMode?: boolean;
}

export type ItemAvailabilityState =
  'available' | 'sold_out' | 'not_yet_open' | 'closed' | 'temporarily_unavailable';

export interface ItemAvailabilityInfo {
  state: ItemAvailabilityState;
  isOrderable: boolean;
  badgeLabel: string | null;
  buttonLabel: string;
  quickAddErrorMessage?: string;
  nextWindowStartTime?: string;
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
 * When the backend supplies no dedicated schedule for Tea, displays an informative
 * guest-friendly message explaining that tea & snack selections are available below.
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
      if (periodLabel.toLowerCase() === 'tea') {
        return "Tea and snack selections are shown below. Please check each item's availability before ordering.";
      }
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
 * Active strictly when: startSeconds <= currentSeconds < cutoffSeconds
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

  // For ALL_DAY: honor server-authorized active status outside nominal hours (e.g. server DEMO_MODE)
  if (window.period === 'ALL_DAY' && window.isActive === true && !window.isCutoffReached) {
    const secondsRemaining =
      window.secondsRemaining > 0
        ? window.secondsRemaining
        : Math.max(0, cutoffSeconds - currentSeconds);
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
 * 1. Backend item-level restrictions are strictly authoritative:
 *    - item.available === false prevents ordering (Sold Out)
 *    - item.isOrderable === false prevents ordering (Outside Ordering Hours)
 *    - item.isCutoff === true prevents ordering (Cutoff Reached)
 *    The client clock CANNOT override a server-declared unavailable/unorderable item.
 * 2. If no meal windows are provided, defer to server-side item.isOrderable.
 * 3. For items with meal periods:
 *    - Item is orderable if AT LEAST ONE of its meal periods is currently within its active window.
 *    - For regular meal windows (BREAKFAST, LUNCH, DINNER, and standard ALL_DAY),
 *      start and cutoff boundaries are enforced against current Asia/Colombo time:
 *      active strictly when: currentSeconds >= startSeconds && currentSeconds < cutoffSeconds.
 *    - Cached `window.isActive === true` is NOT blindly treated as permanently active;
 *      as soon as the cutoff time is reached in Colombo, the client transitions to closed.
 *    - When explicit DEMO_MODE is active (e.g. verified via options or demo runtime context),
 *      ALL_DAY is continuously active (24/7) matching the server-side demo policy.
 *    - No fabricated schedules: missing window definitions never assume 06:00–23:00.
 */
export function isItemCurrentlyOrderable(
  item: GuestMenuItem,
  mealWindows?: MealWindowStatus[],
  colomboSeconds?: number,
  options?: OrderableEvaluationOptions,
): boolean {
  // 1. Authoritative backend item-level restrictions
  if (!item.available) return false;
  if (!item.isOrderable) return false;
  if (item.isCutoff) return false;

  // 2. If no windows provided, rely on backend item-level flags
  if (!mealWindows || mealWindows.length === 0) {
    return true;
  }

  const itemPeriods = item.mealPeriods || [];
  if (itemPeriods.length === 0) {
    return true;
  }

  const currentSeconds =
    typeof colomboSeconds === 'number' ? colomboSeconds : getColomboTime().totalSecondsOfDay;

  // 3. Check if at least one applicable meal period is currently within its permitted ordering window
  return itemPeriods.some((period) => {
    const win = mealWindows.find((w) => w.period === period);
    if (!win || !win.startTime || !win.cutoffTime) {
      // Do NOT fabricate operational schedules for missing windows
      return false;
    }

    const startSec = parseTimeToSeconds(win.startTime);
    const cutoffSec = parseTimeToSeconds(win.cutoffTime);

    // Regular meal windows (BREAKFAST, LUNCH, DINNER):
    // Strictly enforce backend-provided start and cutoff times in Asia/Colombo.
    // Transition to closed immediately when cutoff time is reached.
    if (period !== 'ALL_DAY') {
      return currentSeconds >= startSec && currentSeconds < cutoffSec;
    }

    // ALL_DAY dining:
    // If explicit demo option is provided, honor it for controlled test isolation:
    if (options?.isDemoMode === true) {
      return true;
    }
    if (options?.isDemoMode === false) {
      return currentSeconds >= startSec && currentSeconds < cutoffSec;
    }

    // When running in real application without explicit override:
    // 1. Within standard operational hours (06:00:00 to 23:00:00), ALL_DAY is active.
    if (currentSeconds >= startSec && currentSeconds < cutoffSec) {
      return true;
    }

    // 2. Outside standard 06:00–23:00 hours:
    // Safely resolve via contract-supported values without inventing a demo-mode indicator:
    // In server DEMO_MODE, the backend explicitly sets win.isActive === true and !win.isCutoffReached.
    // In production, the backend returns win.isActive === false and win.isCutoffReached === true.
    return win.isActive === true && !win.isCutoffReached;
  });
}

/**
 * Determines whether an item's ordering window has reached cutoff.
 */
export function isItemCutoff(
  item: GuestMenuItem,
  mealWindows?: MealWindowStatus[],
  colomboSeconds?: number,
  options?: OrderableEvaluationOptions,
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
  return !isItemCurrentlyOrderable(item, mealWindows, colomboSeconds, options);
}

/**
 * Evaluates fine-grained availability status for an item to provide guest-friendly messages:
 * - 'sold_out': Item is out of stock (available === false)
 * - 'not_yet_open': Item's applicable meal window has not yet opened today
 * - 'closed': Item's applicable meal window has passed its cutoff for today
 * - 'temporarily_unavailable': Item has missing schedule data or backend isOrderable === false without cutoff
 * - 'available': Item is currently in-stock and within an active ordering window
 */
export function getItemAvailability(
  item: GuestMenuItem,
  mealWindows?: MealWindowStatus[],
  colomboSeconds?: number,
  options?: OrderableEvaluationOptions,
): ItemAvailabilityInfo {
  // 1. Authoritative sold out
  if (!item.available) {
    return {
      state: 'sold_out',
      isOrderable: false,
      badgeLabel: 'Sold Out',
      buttonLabel: 'Item Sold Out',
      quickAddErrorMessage: 'Item is sold out.',
    };
  }

  // 2. Authoritative backend cutoff flag
  if (item.isCutoff) {
    return {
      state: 'closed',
      isOrderable: false,
      badgeLabel: 'Closed',
      buttonLabel: 'Ordering Closed',
      quickAddErrorMessage: 'Ordering for this item has closed for today.',
    };
  }

  // 3. Backend explicit isOrderable === false without cutoff
  if (!item.isOrderable) {
    return {
      state: 'temporarily_unavailable',
      isOrderable: false,
      badgeLabel: 'Unavailable',
      buttonLabel: 'Service Unavailable',
      quickAddErrorMessage: 'This item is currently unavailable.',
    };
  }

  const currentSeconds =
    typeof colomboSeconds === 'number' ? colomboSeconds : getColomboTime().totalSecondsOfDay;

  // 4. Check if currently orderable under authoritative rules
  const isOrderableNow = isItemCurrentlyOrderable(item, mealWindows, currentSeconds, options);
  if (isOrderableNow) {
    return {
      state: 'available',
      isOrderable: true,
      badgeLabel: null,
      buttonLabel: 'Add to Cart',
    };
  }

  // 5. Item is not orderable right now. Inspect meal windows to distinguish reasons:
  const itemPeriods = item.mealPeriods || [];
  if (!mealWindows || mealWindows.length === 0 || itemPeriods.length === 0) {
    return {
      state: 'temporarily_unavailable',
      isOrderable: false,
      badgeLabel: 'Unavailable',
      buttonLabel: 'Service Unavailable',
      quickAddErrorMessage: 'Ordering schedule is currently unavailable.',
    };
  }

  const resolvedWindows: Array<{ win: MealWindowStatus; startSec: number; cutoffSec: number }> = [];
  let hasMissingWindow = false;

  for (const period of itemPeriods) {
    const win = mealWindows.find((w) => w.period === period);
    if (!win || !win.startTime || !win.cutoffTime) {
      hasMissingWindow = true;
      continue;
    }
    resolvedWindows.push({
      win,
      startSec: parseTimeToSeconds(win.startTime),
      cutoffSec: parseTimeToSeconds(win.cutoffTime),
    });
  }

  if (resolvedWindows.length === 0 && hasMissingWindow) {
    return {
      state: 'temporarily_unavailable',
      isOrderable: false,
      badgeLabel: 'Unavailable',
      buttonLabel: 'Service Unavailable',
      quickAddErrorMessage: 'Ordering schedule is currently unavailable.',
    };
  }

  // Check if any window is upcoming later today
  const upcomingWindows = resolvedWindows
    .filter((w) => currentSeconds < w.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  if (upcomingWindows.length > 0) {
    const nextWin = upcomingWindows[0];
    const formattedStart = formatTime12Hour(nextWin.win.startTime);
    return {
      state: 'not_yet_open',
      isOrderable: false,
      badgeLabel: `Opens at ${formattedStart}`,
      buttonLabel: 'Ordering Not Yet Open',
      quickAddErrorMessage: `Ordering is not yet open for this item (starts at ${formattedStart}).`,
      nextWindowStartTime: nextWin.win.startTime,
    };
  }

  // All applicable windows have passed their cutoff today
  return {
    state: 'closed',
    isOrderable: false,
    badgeLabel: 'Closed',
    buttonLabel: 'Ordering Closed',
    quickAddErrorMessage: 'Ordering for this item has closed for today.',
  };
}
