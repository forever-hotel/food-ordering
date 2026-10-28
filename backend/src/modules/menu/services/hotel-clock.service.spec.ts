import { beforeEach, describe, expect, it } from '@jest/globals';
import { HotelClockService } from './hotel-clock.service.js';

describe('HotelClockService', () => {
  let clock: HotelClockService;

  beforeEach(() => {
    clock = new HotelClockService();
  });

  it('returns current date when no fixed time is set', () => {
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('returns overridden fixed time when set', () => {
    const fixed = new Date('2026-10-28T12:30:00.000Z');
    clock.setFixedTime(fixed);

    expect(clock.now().toISOString()).toBe('2026-10-28T12:30:00.000Z');

    clock.setFixedTime(null);
    expect(clock.now().getTime()).not.toBe(fixed.getTime());
  });

  it('correctly calculates totalSecondsOfDay in Asia/Colombo (UTC+5:30)', () => {
    // 04:30 UTC is 10:00 AM in Asia/Colombo
    const date = new Date('2026-10-28T04:30:00.000Z');
    const parts = clock.getColomboTimeParts(date);

    expect(parts.hours).toBe(10);
    expect(parts.minutes).toBe(0);
    expect(parts.seconds).toBe(0);
    expect(parts.totalSecondsOfDay).toBe(10 * 3600);
  });

  it('handles midnight edge cases in Asia/Colombo', () => {
    // 18:30 UTC is 00:00 midnight in Asia/Colombo
    const midnight = new Date('2026-10-28T18:30:00.000Z');
    const parts = clock.getColomboTimeParts(midnight);

    expect(parts.hours).toBe(0);
    expect(parts.minutes).toBe(0);
    expect(parts.seconds).toBe(0);
    expect(parts.totalSecondsOfDay).toBe(0);
  });
});
