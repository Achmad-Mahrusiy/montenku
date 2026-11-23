import { RRule } from "rrule";
import { isWallTime, wallTimeToInstant } from "@/lib/time";

// Computes occurrences of a recurring schedule (DECISIONS.md D-002 to D-004, docs/fase-0-arsitektur.md).
// rrule only does calendar arithmetic on "floating" dates: wall-clock time wrapped in UTC, no TZID.
// Turning wall-clock time into a real instant is Temporal's job (wallTimeToInstant), so the result
// never depends on the server's timezone.

/** Wall-clock "YYYY-MM-DDTHH:mm" as a floating Date (the wall time read as if it were UTC). */
const floating = (wall: string) => new Date(`${wall}:00Z`);
const toWall = (date: Date) => date.toISOString().slice(0, 16);

export type ScheduleRule = { rrule: string; dtstartLocal: string; timezone: string };
export type ExceptionIn = { occurrenceKey: string; kind: "skip" | "move"; movedToLocal: string | null };
export type Occurrence = {
  /** The occurrence's original wall-clock time. Stable when the account timezone or a move changes (D-004). */
  key: string;
  /** When it actually happens, as wall-clock time in the account timezone (the moved time for a move). */
  wallTime: string;
  at: Date;
  state: "planned" | "moved" | "skipped";
};

const ruleOf = (schedule: ScheduleRule) =>
  new RRule({ ...RRule.parseString(schedule.rrule), dtstart: floating(schedule.dtstartLocal) });

/** True when `key` is a real occurrence of the rule (exceptions whose key no longer matches are ignored, Q3). */
export function isOccurrence(schedule: ScheduleRule, key: string): boolean {
  if (!isWallTime(key)) return false;
  const at = floating(key);
  return ruleOf(schedule).between(at, at, true).length > 0;
}

/** Occurrences that happen in [from, to), sorted by time. Skipped ones only when asked (for the editor list). */
export function occurrencesBetween(
  schedule: ScheduleRule,
  exceptions: ExceptionIn[],
  from: Date,
  to: Date,
  { withSkipped = false } = {},
): Occurrence[] {
  const day = 24 * 60 * 60 * 1000;
  const byKey = new Map(exceptions.map((e) => [e.occurrenceKey, e]));
  const result: Occurrence[] = [];
  const add = (key: string, wallTime: string, state: Occurrence["state"]) => {
    const at = wallTimeToInstant(wallTime, schedule.timezone);
    if (at >= from && at < to) result.push({ key, wallTime, at, state });
  };

  // A wall-clock window one day wider on each side covers every UTC offset (-12h to +14h).
  for (const date of ruleOf(schedule).between(new Date(from.getTime() - day), new Date(to.getTime() + day), true)) {
    const key = toWall(date);
    const exception = byKey.get(key);
    if (!exception) add(key, key, "planned");
    else if (exception.kind === "skip" && withSkipped) add(key, key, "skipped");
  }
  // Moves are checked on their own: one can land weeks away from its original date, outside the window above.
  for (const e of exceptions) {
    if (e.kind === "move" && e.movedToLocal && isOccurrence(schedule, e.occurrenceKey)) add(e.occurrenceKey, e.movedToLocal, "moved");
  }
  return result.sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key));
}
