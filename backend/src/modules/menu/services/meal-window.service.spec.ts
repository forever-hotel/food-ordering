import { beforeEach, describe, expect, it } from '@jest/globals';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { HotelClockService } from './hotel-clock.service.js';
import { MealWindowService } from './meal-window.service.js';

describe('MealWindowService', () => {
  let clock: HotelClockService;
  let service: MealWindowService;

  beforeEach(() => {
    clock = new HotelClockService();
    service = new MealWindowService(clock);
  });

  describe('Non-negotiable Cutoff Boundary Precision', () => {
    // In Asia/Colombo (UTC+5:30):
    // 10:29:59 Colombo = 04:59:59 UTC
    // 10:30:00 Colombo = 05:00:00 UTC
    // 10:30:01 Colombo = 05:00:01 UTC

    it('confirms breakfast window is ACTIVE exactly 1 second before cutoff (10:29:59)', () => {
      const oneSecBeforeCutoff = new Date('2026-10-28T04:59:59.000Z');
      clock.setFixedTime(oneSecBeforeCutoff);

      const status = service.evaluateWindow(MealPeriod.BREAKFAST);

      expect(status.isActive).toBe(true);
      expect(status.isCutoffReached).toBe(false);
      expect(status.secondsRemaining).toBe(1);
    });

    it('confirms breakfast window is INACTIVE and CUTOFF exactly at cutoff (10:30:00)', () => {
      const exactCutoff = new Date('2026-10-28T05:00:00.000Z');
      clock.setFixedTime(exactCutoff);

      const status = service.evaluateWindow(MealPeriod.BREAKFAST);

      expect(status.isActive).toBe(false);
      expect(status.isCutoffReached).toBe(true);
      expect(status.secondsRemaining).toBe(0);
    });

    it('confirms breakfast window remains cutoff 1 second after cutoff (10:30:01)', () => {
      const oneSecAfterCutoff = new Date('2026-10-28T05:00:01.000Z');
      clock.setFixedTime(oneSecAfterCutoff);

      const status = service.evaluateWindow(MealPeriod.BREAKFAST);

      expect(status.isActive).toBe(false);
      expect(status.isCutoffReached).toBe(true);
    });
  });

  describe('Inclusive Start Boundary', () => {
    // Breakfast starts at 06:30:00 Colombo = 01:00:00 UTC
    it('is inactive 1 second before opening (06:29:59 Colombo = 00:59:59 UTC)', () => {
      const beforeOpening = new Date('2026-10-28T00:59:59.000Z');
      clock.setFixedTime(beforeOpening);

      const status = service.evaluateWindow(MealPeriod.BREAKFAST);
      expect(status.isActive).toBe(false);
      expect(status.isCutoffReached).toBe(false);
    });

    it('becomes active exactly at opening second (06:30:00 Colombo = 01:00:00 UTC)', () => {
      const atOpening = new Date('2026-10-28T01:00:00.000Z');
      clock.setFixedTime(atOpening);

      const status = service.evaluateWindow(MealPeriod.BREAKFAST);
      expect(status.isActive).toBe(true);
      expect(status.isCutoffReached).toBe(false);
      expect(status.secondsRemaining).toBe(4 * 3600); // 4 hours from 06:30 to 10:30
    });
  });

  describe('Lunch, Dinner, and All Day Window Schedules', () => {
    // 13:00 Colombo (07:30 UTC): Lunch active, Dinner inactive
    it('identifies lunch as active during midday', () => {
      clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const lunch = service.evaluateWindow(MealPeriod.LUNCH);
      expect(lunch.isActive).toBe(true);

      const dinner = service.evaluateWindow(MealPeriod.DINNER);
      expect(dinner.isActive).toBe(false);
    });

    // 20:00 Colombo (14:30 UTC): Dinner active
    it('identifies dinner as active during evening', () => {
      clock.setFixedTime(new Date('2026-10-28T14:30:00.000Z'));

      const dinner = service.evaluateWindow(MealPeriod.DINNER);
      expect(dinner.isActive).toBe(true);
      expect(dinner.isCutoffReached).toBe(false);

      const breakfast = service.evaluateWindow(MealPeriod.BREAKFAST);
      expect(breakfast.isCutoffReached).toBe(true);
    });

    it('returns all active periods via getActiveMealPeriods()', () => {
      // 13:00 Colombo: Both LUNCH and ALL_DAY are active
      clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const active = service.getActiveMealPeriods();
      expect(active).toContain(MealPeriod.LUNCH);
      expect(active).toContain(MealPeriod.ALL_DAY);
      expect(active).not.toContain(MealPeriod.BREAKFAST);
    });
  });

  describe('isItemOrderable() logic', () => {
    it('returns orderable true when item has active meal window', () => {
      // 13:00 Colombo: Lunch active
      clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

      const result = service.isItemOrderable([MealPeriod.LUNCH]);
      expect(result.isOrderable).toBe(true);
      expect(result.activePeriod).toBe(MealPeriod.LUNCH);
      expect(result.isCutoff).toBe(false);
      expect(result.secondsRemaining).toBeGreaterThan(0);
    });

    it('returns orderable false and isCutoff true when meal window has passed cutoff', () => {
      // 16:00 Colombo: Lunch cutoff was 15:00
      clock.setFixedTime(new Date('2026-10-28T10:30:00.000Z'));

      const result = service.isItemOrderable([MealPeriod.LUNCH]);
      expect(result.isOrderable).toBe(false);
      expect(result.activePeriod).toBeNull();
      expect(result.isCutoff).toBe(true);
    });

    it('returns orderable false when no periods are provided or empty array', () => {
      const result = service.isItemOrderable([]);
      expect(result.isOrderable).toBe(false);
      expect(result.activePeriod).toBeNull();
    });
  });

  describe('evaluateKitchenWindow()', () => {
    it('evaluates active and orderable kitchen window when within operating hours', () => {
      // 13:00 Colombo (46,800s)
      const date = new Date('2026-10-28T07:30:00.000Z');
      const window = {
        startTime: '12:00:00',
        cutoffTime: '15:00:00',
        enabled: true,
      };

      const result = service.evaluateKitchenWindow(window, date);
      expect(result.isOrderable).toBe(true);
      expect(result.isCutoff).toBe(false);
      expect(result.secondsRemaining).toBe(7200); // 2 hours remaining until 15:00
    });

    it('rejects invalid or malformed time formats (non-time, out of bounds)', () => {
      const date = new Date('2026-10-28T07:30:00.000Z');

      const invalidRegex = service.evaluateKitchenWindow(
        { startTime: 'invalid-time', cutoffTime: '15:00:00', enabled: true },
        date,
      );
      expect(invalidRegex.isOrderable).toBe(false);
      expect(invalidRegex.isCutoff).toBe(true);

      const invalidHours = service.evaluateKitchenWindow(
        { startTime: '25:00:00', cutoffTime: '15:00:00', enabled: true },
        date,
      );
      expect(invalidHours.isOrderable).toBe(false);
      expect(invalidHours.isCutoff).toBe(true);

      const invalidMinutes = service.evaluateKitchenWindow(
        { startTime: '12:65:00', cutoffTime: '15:00:00', enabled: true },
        date,
      );
      expect(invalidMinutes.isOrderable).toBe(false);

      const invalidSeconds = service.evaluateKitchenWindow(
        { startTime: '12:00:99', cutoffTime: '15:00:00', enabled: true },
        date,
      );
      expect(invalidSeconds.isOrderable).toBe(false);
    });

    it('flags cutoff reached when cutoff is before start or cutoff is passed', () => {
      const date = new Date('2026-10-28T07:30:00.000Z'); // 13:00 Colombo

      // cutoff before start
      const inverted = service.evaluateKitchenWindow(
        { startTime: '15:00:00', cutoffTime: '12:00:00', enabled: true },
        date,
      );
      expect(inverted.isOrderable).toBe(false);
      expect(inverted.isCutoff).toBe(true);

      // past cutoff (cutoff was 12:00)
      const pastCutoff = service.evaluateKitchenWindow(
        { startTime: '06:00:00', cutoffTime: '12:00:00', enabled: true },
        date,
      );
      expect(pastCutoff.isOrderable).toBe(false);
      expect(pastCutoff.isCutoff).toBe(true);
      expect(pastCutoff.secondsRemaining).toBe(0);

      // before start (opens at 18:00)
      const beforeStart = service.evaluateKitchenWindow(
        { startTime: '18:00:00', cutoffTime: '22:00:00', enabled: true },
        date,
      );
      expect(beforeStart.isOrderable).toBe(false);
      expect(beforeStart.isCutoff).toBe(false);

      // disabled window
      const disabled = service.evaluateKitchenWindow(
        { startTime: '12:00:00', cutoffTime: '15:00:00', enabled: false },
        date,
      );
      expect(disabled.isOrderable).toBe(false);
      expect(disabled.isCutoff).toBe(true);
    });
  });

  describe('Unknown Meal Period Guard & Demo Mode', () => {
    it('throws error when evaluating unknown meal period', () => {
      expect(() =>
        service.evaluateWindow('INVALID_PERIOD' as unknown as MealPeriod),
      ).toThrow('Unknown meal period: INVALID_PERIOD');
    });

    it('evaluates all-day dining in demo mode when DEMO_MODE=true', () => {
      const prevEnv = process.env.DEMO_MODE;
      try {
        process.env.DEMO_MODE = 'true';
        clock.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

        const status = service.evaluateWindow(MealPeriod.ALL_DAY);
        expect(status.isActive).toBe(true);
        expect(status.isCutoffReached).toBe(false);
      } finally {
        process.env.DEMO_MODE = prevEnv;
      }
    });
  });
});
