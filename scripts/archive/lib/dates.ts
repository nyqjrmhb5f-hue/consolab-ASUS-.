/**
 * Date utilities for the daily archive report.
 *
 * The report is keyed to a calendar day in a configurable IANA timezone.
 * Event timestamps coming out of the rooms are ISO-8601 UTC strings (or
 * filenames in the `YYYYMMDDTHHMMSSXXXZ-shortid` form). We normalise both
 * to a `YYYY-MM-DD` key in the report timezone so the day-window filter
 * works consistently regardless of where the report runs.
 */

export type DayKey = string; // "YYYY-MM-DD"

const isoFilenameRe = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/;

export function parseEventTimestamp(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const match = trimmed.match(isoFilenameRe);
  if (match) {
    const [, y, m, d, hh, mm, ss, ms] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}Z`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Return the calendar-day key for `date` in `timeZone` as `YYYY-MM-DD`.
 *
 * Uses Intl.DateTimeFormat in `en-CA` locale (which produces ISO ordering)
 * to avoid pulling in a datetime library.
 */
export function dayKeyFor(date: Date, timeZone: string): DayKey {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date);
}

export function previousDayKey(today: Date, timeZone: string): DayKey {
  const todayKey = dayKeyFor(today, timeZone);
  const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
  // Construct the prior day at noon UTC to avoid TZ-shift edge cases when
  // we round-trip back through the formatter.
  const prior = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return dayKeyFor(prior, timeZone);
}

export function isValidDayKey(key: string): key is DayKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function splitDayKey(key: DayKey): { year: string; month: string; day: string } {
  const [year, month, day] = key.split("-") as [string, string, string];
  return { year, month, day };
}

export function dayKeyToUtcMidnight(key: DayKey): Date {
  const { year, month, day } = splitDayKey(key);
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = dayKeyToUtcMidnight(b).getTime() - dayKeyToUtcMidnight(a).getTime();
  return Math.round(ms / 86_400_000);
}
