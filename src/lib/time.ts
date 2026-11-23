import { Temporal } from "temporal-polyfill";

// The only module that imports Temporal (DECISIONS.md D-001). Everything else passes around
// `Date` (an instant, stored as timestamptz) or a wall-clock string "YYYY-MM-DDTHH:mm" plus an IANA zone.

const WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isWallTime(value: string): boolean {
  if (!WALL_TIME.test(value)) return false;
  try {
    // Rejects impossible dates like 2026-02-30 instead of rolling them over.
    Temporal.PlainDateTime.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

/**
 * "2026-11-23T19:00" in `timeZone` -> the instant it happens.
 * DST edge cases use "compatible": a time skipped when clocks jump forward moves forward by the gap,
 * and a time that happens twice when clocks fall back uses the first one.
 */
export function wallTimeToInstant(wallTime: string, timeZone: string): Date {
  if (!isWallTime(wallTime)) throw new RangeError(`Bukan jam dinding yang valid: ${wallTime}`);
  const zoned = Temporal.PlainDateTime.from(wallTime).toZonedDateTime(timeZone, { disambiguation: "compatible" });
  return new Date(zoned.epochMilliseconds);
}

/** Short zone name as Indonesians read it: WIB, WITA, WIT, or e.g. GMT+9 / EST. Depends on the date (DST). */
export function timezoneShortName(timeZone: string, at: Date): string {
  return (
    new Intl.DateTimeFormat("id-ID", { timeZone, timeZoneName: "short" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

/** The instant shown as wall-clock time in `timeZone`, e.g. "2026-11-23T19:00". */
export function instantToWallTime(instant: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

// --- Calendar dates: plain "YYYY-MM-DD" strings, no time and no zone ---

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: string): boolean {
  if (!PLAIN_DATE.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

/** Today's date on the wall calendar in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return instantToWallTime(now, timeZone).slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

/** Jan 31 + 1 month = Feb 28 (clamped), never Mar 3. */
export function addMonths(date: string, months: number): string {
  return Temporal.PlainDate.from(date).add({ months }).toString();
}

/** Monday of the week that contains `date` (weeks start on Monday, as in the Figma calendar). */
export function startOfWeek(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}

export function startOfMonth(date: string): string {
  return Temporal.PlainDate.from(date).with({ day: 1 }).toString();
}

/** Whole weeks (Monday to Sunday) that cover the month of `date`: 4 to 6 rows of 7 dates. */
export function monthGrid(date: string): string[][] {
  const first = startOfMonth(date);
  const last = Temporal.PlainDate.from(first).add({ months: 1 }).subtract({ days: 1 }).toString();
  const weeks: string[][] = [];
  for (let monday = startOfWeek(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

/**
 * The UTC instants that surely contain every wall-clock moment from `firstDate` 00:00 to `lastDate` 24:00
 * in any timezone (offsets run from -12h to +14h). Query with this, then sort items into days by their own zone.
 */
export function utcRangeCovering(firstDate: string, lastDate: string): { from: Date; to: Date } {
  const day = 24 * 60 * 60 * 1000;
  return {
    from: new Date(Date.parse(`${firstDate}T00:00:00Z`) - 14 * 60 * 60 * 1000),
    to: new Date(Date.parse(`${lastDate}T00:00:00Z`) + day + 12 * 60 * 60 * 1000),
  };
}
