import { Injectable } from '@nestjs/common';

@Injectable()
export class HotelClockService {
  private fixedDate: Date | null = null;
  public static readonly TIMEZONE = 'Asia/Colombo';

  /**
   * Returns current Date (or fixed Date if overridden for testing).
   */
  public now(): Date {
    return this.fixedDate ? new Date(this.fixedDate.getTime()) : new Date();
  }

  /**
   * Override the current time for deterministic testing and demo rehearsal.
   */
  public setFixedTime(date: Date | null): void {
    this.fixedDate = date ? new Date(date.getTime()) : null;
  }

  /**
   * Returns the current hours, minutes, seconds, and total seconds of the day in Asia/Colombo.
   */
  public getColomboTimeParts(date: Date = this.now()): {
    hours: number;
    minutes: number;
    seconds: number;
    totalSecondsOfDay: number;
    isoColombo: string;
  } {
    // Format in Asia/Colombo timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: HotelClockService.TIMEZONE,
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

    // Handle potential 24 in some ICU formatters
    if (hours === 24) hours = 0;

    const totalSecondsOfDay = hours * 3600 + minutes * 60 + seconds;
    const isoColombo = date.toLocaleString('en-CA', {
      timeZone: HotelClockService.TIMEZONE,
      hour12: false,
    });

    return {
      hours,
      minutes,
      seconds,
      totalSecondsOfDay,
      isoColombo,
    };
  }
}
