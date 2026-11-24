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
  /** Another post of the same account at the same minute (D-033). */
  clash: boolean;
};

// A slot opens its schedule, where "Isi konten" turns it into an item; nothing is created by a stray click.
const hrefOf = (item: ItemIn) => (item.slot ? `/jadwal?ubah=${item.slot.scheduleId}` : `/konten/${item.id}`);
const minuteOf = (at: Date) => Math.floor(at.getTime() / 60_000);

export type Clash = { accountName: string; timezone: string; at: Date; entries: { id: string; title: string; href: string }[] };

/**
 * Bentrok (D-033): two or more posts of one account in the same minute. Empty schedule slots count too (user's choice);
 * filled slots are already left out by scheduleSlots, so an item never clashes with its own slot. Sorted by time.
 */
export function findClashes(items: ItemIn[]): Clash[] {
  const groups = new Map<string, ItemIn[]>();
  for (const item of items) {
    const key = `${item.account.id}|${minuteOf(item.targetAt)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      accountName: group[0]!.account.name,
      timezone: group[0]!.account.timezone,
      at: new Date(minuteOf(group[0]!.targetAt) * 60_000),
      entries: group.map((item) => ({ id: item.id, title: item.slot ? `Slot ${item.slot.scheduleTitle}` : item.title, href: hrefOf(item) })),
    }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

const clashDay = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** "Masak Hemat punya 2 posting di Jumat, 27 Nov, 19:00 WIB" (time in the account's zone). */
export function describeClash(clash: Clash): string {
  const wall = instantToWallTime(clash.at, clash.timezone);
  const day = clashDay.format(new Date(`${wall.slice(0, 10)}T00:00:00Z`));
  return `${clash.accountName} punya ${clash.entries.length} posting di ${day}, ${wall.slice(11)} ${timezoneShortName(clash.timezone, clash.at)}`;
}

/** The account-zone date of a clash, to keep only those on screen. */
export const clashDate = (clash: Clash) => instantToWallTime(clash.at, clash.timezone).slice(0, 10);

/** Places each item on the day and time of its own account's wall clock, grouped by date and sorted by time. */
export function placeOnCalendar(items: ItemIn[], homeTimeZone = CALENDAR_HOME_TIMEZONE): Map<string, CalendarEntry[]> {
  const byDate = new Map<string, CalendarEntry[]>();
  const clashing = new Set(findClashes(items).flatMap((c) => c.entries.map((e) => e.id)));
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
      href: hrefOf(item),
      slotOf: item.slot?.scheduleTitle ?? null,
      clash: clashing.has(item.id),
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
