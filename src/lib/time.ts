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
