import { instantToWallTime, timezoneShortName } from "@/lib/time";

// shortcut: "today" and which zone counts as "home" use Asia/Jakarta for everyone, until a user timezone setting
// exists (user_settings.timezone, Fase 5). Items themselves always show in their own account's zone (D-022).
export const CALENDAR_HOME_TIMEZONE = "Asia/Jakarta";

type ItemIn = {
  id: string;
  title: string;
  targetAt: Date;
  account: { id: string; name: string; color: string; timezone: string };
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
    };
    const day = byDate.get(entry.date) ?? [];
    day.push(entry);
    byDate.set(entry.date, day);
  }
  for (const day of byDate.values()) day.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  return byDate;
}
