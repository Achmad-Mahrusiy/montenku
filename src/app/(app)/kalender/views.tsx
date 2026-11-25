import * as motion from "motion/react-client";
import Link from "next/link";
import type { CalendarEntry } from "@/lib/calendar";
import { cardHover, cardIn } from "@/lib/motion";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";

// Server-rendered calendar views. Every control is a plain link, so they work without client JavaScript.

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" });
const weekdayShort = fmt({ weekday: "short" });
const dayHeading = fmt({ weekday: "long", day: "numeric", month: "short" });

export const dayNumber = (date: string) => Number(date.slice(8, 10));

type Days = Map<string, CalendarEntry[]>;

/**
 * A light tint of the account color for items; a dashed outline in that color for empty schedule slots (Figma).
 * A clash (D-033) gets the dark-yellow warning border instead, as in the Figma calendar.
 */
const entryStyle = (entry: CalendarEntry) => ({
  ...(entry.slotOf ? { borderColor: entry.color, background: "var(--card)" } : { background: `color-mix(in srgb, ${entry.color} 14%, var(--card))` }),
  ...(entry.clash ? { borderColor: "var(--warning)" } : {}),
});

/** "Bentrok" next to a day that has one (Figma month and list views). */
export function ClashLabel() {
  return <span className="text-xs font-semibold text-warning">Bentrok</span>;
}

/** One entry: account color dot, time in its account's zone, title. Links to the item, or to the schedule for a slot. */
export function EntryChip({ entry, className }: { entry: CalendarEntry; className?: string }) {
  return (
    <Link
      href={entry.href}
      style={entryStyle(entry)}
      className={cn(
        "flex min-h-7 min-w-0 items-center gap-x-1.5 rounded-md px-2 py-1 text-xs outline-none transition-[translate,filter] duration-150 hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:hover:-translate-y-px",
        // A zone label ("GMT+9") leaves no room for the title in a narrow cell: put the title on its own line.
        entry.zoneLabel && "flex-wrap",
        entry.slotOf && "border border-dashed",
        entry.clash && "border-2",
        className,
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {entry.time}
        {entry.zoneLabel ? ` ${entry.zoneLabel}` : null}
      </span>
      <span className={cn("truncate font-semibold", entry.zoneLabel && "basis-full")}>{entry.title}</span>
      <span className="sr-only">
        {entry.slotOf ? `, jadwal ${entry.slotOf}` : null}, {entry.accountName}
        {entry.clash ? ", bentrok dengan posting lain di jam yang sama" : null}
      </span>
    </Link>
  );
}

function TodayNumber({ date, today, className }: { date: string; today: string; className?: string }) {
  const isToday = date === today;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums",
        // The turmeric "stabilo" marks today, as in the Figma calendar.
        isToday && "bg-marker text-marker-foreground",
        className,
      )}
    >
      {dayNumber(date)}
      {isToday ? <span className="sr-only"> (hari ini)</span> : null}
    </span>
  );
}

export function MonthView({
  weeks,
  month,
  days,
  today,
  dayHref,
}: {
  weeks: string[][];
  month: string;
  days: Days;
  today: string;
  dayHref: (date: string) => string;
}) {
  const MAX_CHIPS = 3;
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border bg-card">
      <thead>
        <tr>
          {weeks[0]?.map((date) => (
            <th key={date} scope="col" className="border-b px-2 py-2 text-left text-xs font-normal text-muted-foreground sm:px-3 sm:text-sm">
              {weekdayShort.format(asUtc(date))}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((date) => {
              const entries = days.get(date) ?? [];
              const inMonth = date.slice(0, 7) === month;
              return (
                <td
                  key={date}
                  className={cn("h-20 border-r border-b p-1 align-top last:border-r-0 sm:h-32 sm:p-2", !inMonth && "bg-muted/60")}
                >
                  {/* Phones: the whole cell is one link to that day in the list view; titles do not fit 375px. */}
                  <Link
                    href={dayHref(date)}
                    className="flex h-full flex-col items-start gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:hidden"
                    aria-label={`${dayHeading.format(asUtc(date))}, ${entries.filter((e) => !e.slotOf).length} konten${
                      entries.some((e) => e.slotOf) ? `, ${entries.filter((e) => e.slotOf).length} slot kosong` : ""
                    }${entries.some((e) => e.clash) ? ", ada bentrok" : ""}`}
                  >
                    <TodayNumber date={date} today={today} className={cn(!inMonth && "text-muted-foreground")} />
                    <span aria-hidden="true" className="flex flex-wrap gap-1 px-1">
                      {entries.slice(0, 4).map((e) => (
                        // Hollow dot for an empty slot, filled for real content.
                        <span
                          key={e.id}
                          className="size-2 rounded-full border"
                          style={e.slotOf ? { borderColor: e.color } : { background: e.color, borderColor: e.color }}
                        />
                      ))}
                    </span>
                  </Link>
                  <div className="hidden sm:block">
                    <div className="flex items-center gap-2">
                      <TodayNumber date={date} today={today} className={cn(!inMonth && "text-muted-foreground")} />
                      {entries.some((e) => e.clash) ? <ClashLabel /> : null}
                    </div>
                    <div className="mt-1 grid gap-1">
                      {entries.slice(0, MAX_CHIPS).map((entry) => (
                        <EntryChip key={entry.id} entry={entry} />
                      ))}
                      {entries.length > MAX_CHIPS ? (
                        <Link href={dayHref(date)} className="px-2 text-xs font-semibold underline underline-offset-4">
                          +{entries.length - MAX_CHIPS} lainnya
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WeekView({ monday, days, today, zoneLabel }: { monday: string; days: Days; today: string; zoneLabel: string }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // 06:00 to 21:00 like the Figma week view, stretched when an item falls outside it.
  const hoursUsed = dates.flatMap((d) => (days.get(d) ?? []).map((e) => e.hour));
  const first = Math.min(6, ...hoursUsed);
  const last = Math.max(21, ...hoursUsed);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    // Seven columns do not fit a phone: this box scrolls sideways on purpose (the page itself never does).
    <div tabIndex={0} aria-label="Kalender minggu ini, bisa digeser ke samping" className="relative overflow-x-auto rounded-xl border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th scope="col" className="w-16 border-b px-2 py-3 text-left text-xs font-normal text-muted-foreground">
              {zoneLabel}
            </th>
            {dates.map((date) => (
              <th key={date} scope="col" className="border-b border-l px-2 py-3 text-left text-sm font-normal text-muted-foreground">
                {weekdayShort.format(asUtc(date))} <TodayNumber date={date} today={today} className="text-foreground" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th scope="row" className="border-b px-2 py-2 text-left align-top text-xs font-normal text-muted-foreground tabular-nums">
                {String(hour).padStart(2, "0")}:00
              </th>
              {dates.map((date) => {
                const entries = (days.get(date) ?? []).filter((e) => e.hour === hour);
                return (
                  <td key={date} className="h-12 border-b border-l p-1 align-top">
                    <div className="grid gap-1">
                      {entries.map((entry) => (
                        <EntryChip key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListView({ dates, days, today }: { dates: string[]; days: Days; today: string }) {
  const withEntries = dates.filter((d) => days.has(d));
  return (
    <div className="grid gap-6">
      {withEntries.map((date) => (
        // scroll-mt: the anchor (#hari-...) from a month cell lands below the top edge, not glued to it.
        <section key={date} data-reveal id={`hari-${date}`} aria-labelledby={`judul-${date}`} className="scroll-mt-6">
          <h2 id={`judul-${date}`} className="flex items-center gap-2 font-heading text-lg font-bold">
            {dayHeading.format(asUtc(date))}
            {date === today ? <span className="rounded-md bg-marker px-2 py-0.5 text-sm font-semibold text-marker-foreground">Hari ini</span> : null}
            {(days.get(date) ?? []).some((e) => e.clash) ? (
              <span className="rounded-md bg-warning-surface px-2 py-0.5 font-sans text-sm font-semibold text-warning">Bentrok</span>
            ) : null}
          </h2>
          <ul className="mt-2 grid gap-2">
            {(days.get(date) ?? []).map((entry, i) => (
              <motion.li key={entry.id} {...cardIn(i)} {...cardHover}>
                <Link
                  href={entry.href}
                  style={entry.clash ? { borderColor: "var(--warning)" } : entry.slotOf ? { borderColor: entry.color } : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                    entry.slotOf && "border-dashed",
                    entry.clash && "border-2",
                  )}
                >
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                    {entry.time}
                    {entry.zoneLabel ? <span className="block text-xs font-normal text-muted-foreground">{entry.zoneLabel}</span> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold break-words">{entry.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {entry.slotOf ? `Jadwal ${entry.slotOf} · ` : null}
                      {entry.accountName}
                    </span>
                    {entry.clash ? <span className="block text-sm font-semibold text-warning">Bentrok: jam yang sama dengan posting lain</span> : null}
                  </span>
                </Link>
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
