import { Injectable, Logger } from '@nestjs/common';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { HotelClockService } from './hotel-clock.service.js';

export interface MealWindowDefinition {
  period: MealPeriod;
  name: string;
  startTime: string; // 'HH:mm:ss'
  cutoffTime: string; // 'HH:mm:ss'
  startSeconds: number;
  cutoffSeconds: number;
}

export interface MealWindowStatus {
  period: MealPeriod;
  name: string;
  startTime: string;
  cutoffTime: string;
  isActive: boolean;
  isCutoffReached: boolean;
  secondsRemaining: number;
}

@Injectable()
export class MealWindowService {
  private readonly logger = new Logger(MealWindowService.name);

  // Authoritative operational meal schedules for Forever Hotel (Asia/Colombo)
  public static readonly WINDOW_DEFINITIONS: MealWindowDefinition[] = [
    {
      period: MealPeriod.BREAKFAST,
      name: 'Breakfast',
      startTime: '06:30:00',
      cutoffTime: '10:30:00',
      startSeconds: 6 * 3600 + 30 * 60, // 23,400s
      cutoffSeconds: 10 * 3600 + 30 * 60, // 37,800s
    },
    {
      period: MealPeriod.LUNCH,
      name: 'Lunch',
      startTime: '12:00:00',
      cutoffTime: '15:00:00',
      startSeconds: 12 * 3600, // 43,200s
      cutoffSeconds: 15 * 3600, // 54,000s
    },
    {
      period: MealPeriod.DINNER,
      name: 'Dinner',
      startTime: '18:30:00',
      cutoffTime: '22:30:00',
      startSeconds: 18 * 3600 + 30 * 60, // 66,600s
      cutoffSeconds: 22 * 3600 + 30 * 60, // 81,000s
    },
    {
      period: MealPeriod.ALL_DAY,
      name: 'All Day Dining',
      startTime: '06:00:00',
      cutoffTime: '23:00:00',
      startSeconds: 6 * 3600, // 21,600s
      cutoffSeconds: 23 * 3600, // 82,800s
    },
  ];

  constructor(private readonly clockService: HotelClockService) {}

  /**
   * Evaluates the status of a specific meal window against the current Colombo clock.
   * Inclusive start / Exclusive cutoff rule:
   * Active when startSeconds <= currentSeconds < cutoffSeconds
   */
  public evaluateWindow(
    period: MealPeriod,
    date: Date = this.clockService.now(),
  ): MealWindowStatus {
    const def = MealWindowService.WINDOW_DEFINITIONS.find(
      (w) => w.period === period,
    );
    if (!def) {
      throw new Error(`Unknown meal period: ${period}`);
    }

    const { totalSecondsOfDay } = this.clockService.getColomboTimeParts(date);

    const isActive =
      totalSecondsOfDay >= def.startSeconds &&
      totalSecondsOfDay < def.cutoffSeconds;
    const isCutoffReached = totalSecondsOfDay >= def.cutoffSeconds;

    let secondsRemaining = 0;
    if (isActive) {
      secondsRemaining = def.cutoffSeconds - totalSecondsOfDay;
    }

    return {
      period: def.period,
      name: def.name,
      startTime: def.startTime,
      cutoffTime: def.cutoffTime,
      isActive,
      isCutoffReached,
      secondsRemaining,
    };
  }

  /**
   * Returns evaluation status for all configured meal windows.
   */
  public getAllWindowStatuses(
    date: Date = this.clockService.now(),
  ): MealWindowStatus[] {
    return MealWindowService.WINDOW_DEFINITIONS.map((def) =>
      this.evaluateWindow(def.period, date),
    );
  }

  /**
   * Returns currently active meal periods in Asia/Colombo.
   */
  public getActiveMealPeriods(
    date: Date = this.clockService.now(),
  ): MealPeriod[] {
    return this.getAllWindowStatuses(date)
      .filter((w) => w.isActive)
      .map((w) => w.period);
  }

  /**
   * Checks if an item associated with the given meal periods can currently be ordered.
   */
  public isItemOrderable(
    itemMealPeriods: MealPeriod[],
    date: Date = this.clockService.now(),
  ): {
    isOrderable: boolean;
    activePeriod: MealPeriod | null;
    isCutoff: boolean;
    secondsRemaining: number;
  } {
    const statuses = this.getAllWindowStatuses(date);
    const relevantStatuses = statuses.filter((s) =>
      itemMealPeriods.includes(s.period),
    );

    const activeStatus = relevantStatuses.find((s) => s.isActive);
    if (activeStatus) {
      return {
        isOrderable: true,
        activePeriod: activeStatus.period,
        isCutoff: false,
        secondsRemaining: activeStatus.secondsRemaining,
      };
    }

    // Check if cutoff was reached for the meal periods
    const cutoffStatus = relevantStatuses.find((s) => s.isCutoffReached);

    return {
      isOrderable: false,
      activePeriod: null,
      isCutoff: !!cutoffStatus,
      secondsRemaining: 0,
    };
  }
}
