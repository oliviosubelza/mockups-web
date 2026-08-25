import type { DayCode, RouteFrequency, WeekPosition } from "../types";

const JS_DAY_TO_CODE: DayCode[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Local `YYYY-MM-DD` (not `toISOString`, which shifts to UTC and can roll the date). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` key as a local date (avoids the UTC-midnight shift of `new Date(key)`). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` of today shifted by `days` (negative = past). */
export function dateKeyOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** `YYYY-MM-DD` of the 1st of the current month. */
export function firstDayOfMonthKey(): string {
  const d = new Date();
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function dayCodeOf(date: Date): DayCode {
  return JS_DAY_TO_CODE[date.getDay()];
}

/** 1st-4th week of the month the date falls in (clamped to 4). */
export function weekOfMonth(date: Date): WeekPosition {
  return Math.min(Math.ceil(date.getDate() / 7), 4) as WeekPosition;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weeksBetween(a: Date, b: Date): number {
  return Math.round((startOfWeekMonday(b).getTime() - startOfWeekMonday(a).getTime()) / MS_PER_WEEK);
}

/**
 * Whether `date` is a scheduled visit day for this frequency:
 *  - SEMANAL: every week, on `days`.
 *  - QUINCENAL: every other week on `days`, parity anchored to `validFrom`'s week.
 *  - MENSUAL: only on the month-weeks listed in `weeks`, on `days`.
 * Always bounded by [validFrom, validTo].
 */
export function isScheduledDay(freq: RouteFrequency, date: Date): boolean {
  const key = toDateKey(date);
  if (key < freq.validFrom || key > freq.validTo) return false;
  return matchesCadence(freq, date);
}

/**
 * The cadence rules alone, ignoring the [validFrom, validTo] window. Used to
 * backfill history from a schedule that only becomes valid at the seed epoch —
 * past visits are generated as if today's cadence had always been in effect.
 */
export function matchesCadence(freq: RouteFrequency, date: Date): boolean {
  if (!freq.days.includes(dayCodeOf(date))) return false;

  switch (freq.type) {
    case "MENSUAL":
      return freq.weeks.includes(weekOfMonth(date));
    case "QUINCENAL":
      return weeksBetween(parseDateKey(freq.validFrom), date) % 2 === 0;
    case "SEMANAL":
    default:
      return true;
  }
}
