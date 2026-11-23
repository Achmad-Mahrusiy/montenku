import { occurrencesBetween, type ExceptionIn } from "@/lib/occurrences";
import { instantToWallTime, timezoneShortName } from "@/lib/time";

// The "home" zone is the user's own (Pengaturan, D-032); this default matches user_settings.timezone's.
// Items themselves always show in their own account's zone (D-022).
export const CALENDAR_HOME_TIMEZONE = "Asia/Jakarta";

type Account = { id: string; name: string; color: string; timezone: string };
type ItemIn = {
  id: string;
  title: string;
  targetAt: Date;
  account: Account;
  /** Set for an empty slot of a recurring schedule instead of a real item. */
  slot?: { scheduleId: string; scheduleTitle: string };
};

export type CalendarEntry = {
  id: string;
  title: string;
  accountName: string;
  color: string;
  /** "YYYY-MM-DD" in the item's account timezone. */
  date: string;
  /** "HH:mm" in the item's account timezone. */
  time: string;
  hour: number;
  /** Zone name when it differs from the home zone (e.g. "GMT+9"), so 19:00 Tokyo is not mistaken for 19:00 WIB. */
  zoneLabel: string | null;
  href: string;
  /** Schedule name when this is an empty slot ("Slot kosong"), null for a real content item. */
  slotOf: string | null;
};

/** Places each item on the day and time of its own account's wall clock, grouped by date and sorted by time. */
export function placeOnCalendar(items: ItemIn[], homeTimeZone = CALENDAR_HOME_TIMEZONE): Map<string, CalendarEntry[]> {
  const byDate = new Map<string, CalendarEntry[]>();
  for (const item of items) {
    const wall = instantToWallTime(item.targetAt, item.account.timezone);
    const entry: CalendarEntry = {
      id: item.id,
      title: item.title,
      accountName: item.account.name,
      color: item.account.color,
      date: wall.slice(0, 10),
      time: wall.slice(11),
      hour: Number(wall.slice(11, 13)),
      zoneLabel: item.account.timezone === homeTimeZone ? null : timezoneShortName(item.account.timezone, item.targetAt),
      // A slot opens its schedule, where "Isi konten" turns it into an item; nothing is created by a stray click.
      href: item.slot ? `/jadwal?ubah=${item.slot.scheduleId}` : `/konten/${item.id}`,
      slotOf: item.slot?.scheduleTitle ?? null,
    };
    const day = byDate.get(entry.date) ?? [];
    day.push(entry);
    byDate.set(entry.date, day);
  }
  for (const day of byDate.values()) day.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  return byDate;
}

type ScheduleIn = { id: string; title: string; rrule: string; dtstartLocal: string; account: Account & { archivedAt: Date | null }; exceptions: ExceptionIn[] };

/**
 * Empty slots of recurring schedules in [from, to), ready for placeOnCalendar. Filled slots are left out (their item
 * shows instead), skipped ones too, moved ones appear at their new time. Archived accounts get no new slots.
 */
export function scheduleSlots(
  schedules: ScheduleIn[],
  filled: { scheduleId: string; occurrenceKey: string }[],
  from: Date,
  to: Date,
): ItemIn[] {
  const taken = new Set(filled.map((f) => `${f.scheduleId}|${f.occurrenceKey}`));
  return schedules
    .filter((s) => !s.account.archivedAt)
    .flatMap((s) =>
      occurrencesBetween({ rrule: s.rrule, dtstartLocal: s.dtstartLocal, timezone: s.account.timezone }, s.exceptions, from, to)
        .filter((o) => !taken.has(`${s.id}|${o.key}`))
        .map((o) => ({
          id: `${s.id}:${o.key}`,
          title: "Slot kosong",
          targetAt: o.at,
          account: s.account,
          slot: { scheduleId: s.id, scheduleTitle: s.title },
        })),
    );
}
