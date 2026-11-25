import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { StatusTrack } from "@/components/status-track";
import * as motion from "motion/react-client";
import { Button } from "@/components/ui/button";
import { clashDate, describeClash, findClashes, placeOnCalendar, scheduleSlots, type CalendarEntry } from "@/lib/calendar";
import { lateLabel, pickReminder, todoLists, UPCOMING_MS, type TodoRow } from "@/lib/dashboard";
import { cardIn } from "@/lib/motion";
import { addDays, instantToWallTime, startOfWeek, todayIn, utcRangeCovering } from "@/lib/time";
import { cn } from "@/lib/utils";
import { statusLabels } from "@/lib/validation/content-item";
import { channelLabels, offsetLabel } from "@/lib/validation/reminder";
import { listContentAccounts } from "@/server/dal/content-accounts";
import { listContentItems, listDeadlines, listLatePostings, type CalendarItem } from "@/server/dal/content-items";
import { listFailedReminders, listReminderSummaries, type ReminderSummary } from "@/server/dal/reminder-settings";
import { listFilledSlots, listSchedules } from "@/server/dal/schedules";
import { requireUser } from "@/server/dal/session";
import { getUserSettings } from "@/server/dal/user-settings";
import { ClashLabel, EntryChip } from "./kalender/views";

export const metadata: Metadata = { title: "Dashboard | Montenku" };

// The "Dashboard Hari ini" screen from Figma, plus a "Minggu ini" tab (no frame; same parts, the week's postings).
// Rules for late/upcoming/which reminder live in lib/dashboard (D-033).

const DAY_MS = 24 * 60 * 60 * 1000;
// shortcut: clashes are looked for 30 days ahead and late work 30 days back; widen if creators plan further out.
const CLASH_DAYS = 30;
const LOOKBACK_MS = 30 * DAY_MS;
const MAX_CLASH_ALERTS = 3;
const MAX_TODO = 8;
// A failed reminder stays on the dashboard until a day after its posting time; the item page keeps it for good.
const FAILED_KEEP_MS = DAY_MS;

const currentTime = () => new Date();
const tabSchema = z.enum(["hari-ini", "minggu"]).catch("hari-ini");

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" });
const fullDate = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayLabel = fmt({ weekday: "long", day: "numeric", month: "short" });
const weekdayShort = fmt({ weekday: "short" });
const monthLong = fmt({ day: "numeric", month: "long" });

/** "Sabtu, 21 Nov, 10:00" for an instant on its account's wall clock. */
function wallLabel(at: Date, timeZone: string) {
  const wall = instantToWallTime(at, timeZone);
  return { day: dayLabel.format(asUtc(wall.slice(0, 10))), date: wall.slice(0, 10), time: wall.slice(11) };
}

const slotParts = (entryId: string) => {
  const at = entryId.indexOf(":");
  return { scheduleId: entryId.slice(0, at), occurrenceKey: entryId.slice(at + 1) };
};

function remindersOf(entry: CalendarEntry, item: CalendarItem | undefined, all: ReminderSummary[]) {
  if (item) {
    return all.filter(
      (r) => r.itemId === item.id || (item.scheduleId !== null && r.scheduleId === item.scheduleId && r.occurrenceKey === item.occurrenceKey),
    );
  }
  const slot = slotParts(entry.id);
  return all.filter((r) => r.scheduleId === slot.scheduleId && r.occurrenceKey === slot.occurrenceKey);
}

// -my-3 py-3: a 44px tap target on a one-line title without spreading the list out.
const titleLink = "-my-3 inline-block py-3 font-semibold break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

const badgeStyles = {
  sent: ["bg-success-surface text-success", "Terkirim"],
  pending: ["bg-muted text-muted-foreground", "Terjadwal"],
  sending: ["bg-muted text-muted-foreground", "Terjadwal"],
  failed: ["bg-destructive-surface text-destructive", "Gagal kirim"],
} as const;

function PostingRow({ entry, item, reminder, timeZone, order }: { entry: CalendarEntry; item?: CalendarItem; reminder: ReminderSummary | null; timeZone: string; order: number }) {
  const badge = reminder && reminder.status !== "cancelled" ? badgeStyles[reminder.status] : null;
  const send = reminder ? wallLabel(reminder.sendAt, timeZone) : null;
  const sendText = send ? (send.date === entry.date ? send.time : `${send.day}, ${send.time}`) : "";
  return (
    <motion.li {...cardIn(order + 3)} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
      <p className="w-16 shrink-0 font-heading text-xl font-bold tabular-nums">
        {entry.time}
        {entry.zoneLabel ? <span className="block font-sans text-xs font-normal text-muted-foreground">{entry.zoneLabel}</span> : null}
      </p>
      <div className="min-w-0 flex-1 basis-48">
        <Link href={entry.href} className={titleLink}>
          {entry.slotOf ? `Slot kosong: ${entry.slotOf}` : entry.title}
        </Link>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: entry.color }} />
          {entry.accountName}
        </p>
        {item ? <StatusTrack status={item.status} className="mt-2" /> : <p className="mt-1 text-sm text-muted-foreground">Belum diisi konten.</p>}
        {entry.clash ? <p className="mt-1 text-sm font-semibold text-warning">Bentrok: jam yang sama dengan posting lain di akun ini</p> : null}
      </div>
      {badge && reminder ? (
        <div className="grid justify-items-start gap-1 sm:justify-items-end sm:text-right">
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", badge[0])}>{badge[1]}</span>
          <p className="text-sm text-muted-foreground">
            Pengingat {offsetLabel(reminder.offsetMinutes)}:{" "}
            {reminder.status === "failed" ? "gagal kirim" : reminder.status === "sent" ? `terkirim ${sendText}` : sendText}
          </p>
        </div>
      ) : null}
    </motion.li>
  );
}

function TodoList({ title, rows, empty, now, late, order }: { title: string; rows: TodoRow[]; empty: string; now: Date; late: boolean; order: number }) {
  return (
    <motion.section {...cardIn(order)} aria-labelledby={`todo-${late ? "late" : "soon"}`} className="rounded-xl border bg-card p-5">
      <h2 id={`todo-${late ? "late" : "soon"}`} className="font-heading text-xl font-bold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 grid gap-4">
          {rows.slice(0, MAX_TODO).map((row) => {
            const due = wallLabel(row.dueAt, row.account.timezone);
            const what = row.what === "posted" ? "Waktu posting" : late ? `Tenggat ${statusLabels[row.what].toLowerCase()}` : statusLabels[row.what];
            return (
              <li key={row.itemId}>
                <Link href={`/konten/${row.itemId}`} className={titleLink}>
                  {row.title}
                </Link>
                <p className="mt-0.5 flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: row.account.color }} />
                  {row.account.name}
                </p>
                <p className={cn("mt-0.5 text-sm", late ? "text-destructive" : "text-muted-foreground")}>
                  {late ? `${what} ${due.day}, ${lateLabel(row.dueAt, now, row.account.timezone)}` : `${what}, ${due.day}, ${due.time}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > MAX_TODO ? <p className="mt-3 text-sm text-muted-foreground">dan {rows.length - MAX_TODO} lainnya</p> : null}
    </motion.section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tampilan?: string | string[] }> }) {
  const user = await requireUser();
  const tab = tabSchema.parse((await searchParams).tampilan);
  const now = currentTime();
  const { timezone } = await getUserSettings(user.id);
  const today = todayIn(timezone, now);
  const monday = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const lastClashDay = addDays(today, CLASH_DAYS);
  // Padded for every timezone; entries are then placed on their own account's dates.
  const range = utcRangeCovering(monday, lastClashDay);

  const [accounts, items, schedules, deadlines, latePosts, failed] = await Promise.all([
    listContentAccounts(user.id),
    listContentItems(user.id, range),
    listSchedules(user.id),
    listDeadlines(user.id, { from: new Date(now.getTime() - LOOKBACK_MS), to: new Date(now.getTime() + UPCOMING_MS) }),
    listLatePostings(user.id, { from: new Date(now.getTime() - LOOKBACK_MS), to: now }),
    listFailedReminders(user.id, new Date(now.getTime() - FAILED_KEEP_MS)),
  ]);

  if (!accounts.some((a) => !a.archivedAt)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
        <h1 className="font-heading text-3xl font-bold break-words">Halo, {user.name}</h1>
        <section className="mt-8 rounded-xl border border-dashed bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tambahkan akun TikTok, Instagram, atau YouTube yang kamu kelola. Jadwal dan pengingat nanti menempel ke akun ini.
          </p>
          <Button asChild className="mt-4">
            <Link href="/akun-konten?tambah=1">Tambah akun konten</Link>
          </Button>
        </section>
      </main>
    );
  }

  const filled = await listFilledSlots(user.id, schedules.map((s) => s.id));
  const all = [...items, ...scheduleSlots(schedules, filled, range.from, range.to)];
  const days = placeOnCalendar(all, timezone);
  const clashes = findClashes(all).filter((c) => clashDate(c) >= today && clashDate(c) <= lastClashDay);
  const shownDates = tab === "minggu" ? week : [today];
  const listed = shownDates.flatMap((d) => days.get(d) ?? []);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const listedItems = listed.flatMap((e) => itemsById.get(e.id) ?? []);
  const summaries = await listReminderSummaries(user.id, {
    itemIds: listedItems.map((i) => i.id),
    scheduleIds: [...new Set([...listedItems.flatMap((i) => (i.scheduleId ? [i.scheduleId] : [])), ...listed.filter((e) => e.slotOf).map((e) => slotParts(e.id).scheduleId)])],
  });
  const { late, upcoming } = todoLists(deadlines, latePosts, now);
  const accountCount = new Set(listed.map((e) => e.accountName)).size;
  const period = tab === "minggu" ? "minggu ini" : "hari ini";
  const tabs = [
    { key: "hari-ini", label: "Hari ini", href: "/" },
    { key: "minggu", label: "Minggu ini", href: "/?tampilan=minggu" },
  ] as const;

  const row = (entry: CalendarEntry, order: number) => {
    const item = itemsById.get(entry.id);
    // Reminder times show on the account's wall clock, like the posting time next to them (D-022).
    const zone = item?.account.timezone ?? schedules.find((s) => s.id === slotParts(entry.id).scheduleId)?.account.timezone ?? timezone;
    return <PostingRow key={entry.id} entry={entry} item={item} reminder={pickReminder(remindersOf(entry, item, summaries))} timeZone={zone} order={order} />;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-auto flex items-center gap-4">
          {/* The big date in the turmeric "stabilo" is the focal point of the Figma dashboard. */}
          <span aria-hidden="true" className="rounded-lg bg-marker px-3 py-1 font-heading text-5xl font-bold text-marker-foreground tabular-nums">
            {Number(today.slice(8))}
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold">{fullDate.format(asUtc(today))}</h1>
            <p className="text-sm text-muted-foreground">
              {listed.length === 0 ? `Belum ada posting ${period}` : `${listed.length} posting ${period} di ${accountCount} akun`}
            </p>
          </div>
        </div>
        <nav aria-label="Rentang dashboard" className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "flex h-11 items-center rounded-md px-4 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
                t.key === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Button asChild>
          <Link href="/konten/baru">Buat konten baru</Link>
        </Button>
      </div>

      {failed.length > 0 || clashes.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {failed[0] ? (
            <motion.section {...cardIn(1)} className="flex flex-wrap items-center gap-3 rounded-xl bg-destructive-surface p-4">
              <div className="min-w-0 flex-1 basis-64">
                <h2 className="text-sm font-semibold text-destructive">{failed.length} pengingat gagal terkirim</h2>
                <p className="text-sm break-words">
                  Pengingat {channelLabels[failed[0].channel].toLowerCase()} {offsetLabel(failed[0].offsetMinutes)} untuk &quot;{failed[0].title}&quot; ({failed[0].accountName}) gagal 5 kali.
                  {failed.length > 1 ? ` Ada ${failed.length - 1} lainnya.` : ""}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={failed[0].href}>Lihat konten</Link>
              </Button>
            </motion.section>
          ) : null}
          {clashes.slice(0, MAX_CLASH_ALERTS).map((c, i) => (
            <motion.section key={i} {...cardIn(1 + i)} className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-surface p-4">
              <div className="min-w-0 flex-1 basis-64">
                <h2 className="text-sm font-semibold text-warning">Bentrok jadwal di {c.accountName}</h2>
                <p className="text-sm break-words">
                  {describeClash(c)}: {c.entries.map((e) => e.title).join(" dan ")}.
                </p>
              </div>
              <Button asChild variant="outline">
                {/* An item's time is edited on its page; a slot only through its schedule. */}
                <Link href={(c.entries.find((e) => e.href.startsWith("/konten/")) ?? c.entries[0]!).href}>Atur ulang jam</Link>
              </Button>
            </motion.section>
          ))}
          {clashes.length > MAX_CLASH_ALERTS ? (
            <p className="text-sm text-muted-foreground">
              Ada {clashes.length - MAX_CLASH_ALERTS} bentrok lain dalam {CLASH_DAYS} hari ke depan.{" "}
              <Link href="/kalender" className="font-semibold text-foreground underline underline-offset-4">
                Lihat kalender
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <motion.section {...cardIn(2)} aria-labelledby="postings-title" className="rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="postings-title" className="font-heading text-xl font-bold">
            Posting {period}
          </h2>
          {listed.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Tidak ada posting {period}.{" "}
              <Link href="/konten/baru" className="font-semibold text-foreground underline underline-offset-4">
                Buat konten baru
              </Link>
            </p>
          ) : tab === "minggu" ? (
            <div className="mt-2 grid gap-4">
              {week
                .filter((d) => days.get(d)?.length)
                .map((d) => (
                  <div key={d}>
                    <h3 className="mt-2 flex items-center gap-2 font-semibold">
                      {dayLabel.format(asUtc(d))}
                      {d === today ? <span className="rounded-md bg-marker px-2 py-0.5 text-xs text-marker-foreground">Hari ini</span> : null}
                    </h3>
                    <ul className="divide-y">{(days.get(d) ?? []).map(row)}</ul>
                  </div>
                ))}
            </div>
          ) : (
            <ul className="mt-2 divide-y border-t">{listed.map(row)}</ul>
          )}
        </motion.section>

        <div className="grid gap-6">
          <TodoList title="Terlambat" rows={late} empty="Tidak ada yang terlambat." now={now} late order={3} />
          <TodoList title="Tenggat mendekat" rows={upcoming} empty="Tidak ada tenggat dalam 7 hari ke depan." now={now} late={false} order={4} />
        </div>
      </div>

      {tab === "hari-ini" ? (
        <section data-reveal aria-labelledby="week-title" className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="week-title" className="flex flex-wrap items-baseline gap-x-3 font-heading text-xl font-bold">
            Minggu ini
            <span className="font-sans text-sm font-normal text-muted-foreground">
              {monthLong.format(asUtc(monday))} sampai {monthLong.format(asUtc(addDays(monday, 6)))}
            </span>
          </h2>
          {/* Seven columns do not fit a phone: this strip scrolls sideways on purpose (the page itself never does).
              relative: keeps the sr-only texts inside it, or they widen the whole page on phones. */}
          <div tabIndex={0} aria-label="Posting minggu ini, bisa digeser ke samping" className="relative mt-4 overflow-x-auto rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ol className="grid min-w-[700px] grid-cols-7 gap-2">
              {week.map((d) => {
                const entries = days.get(d) ?? [];
                return (
                  <li key={d} className={cn("grid content-start gap-1 rounded-lg border p-2", d === today ? "border-2 border-marker" : "border-transparent")}>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {weekdayShort.format(asUtc(d))} {Number(d.slice(8))}
                      {d === today ? <span className="sr-only">(hari ini)</span> : null}
                      {entries.some((e) => e.clash) ? <ClashLabel /> : null}
                    </p>
                    {entries.length === 0 ? <p className="text-xs text-muted-foreground">Kosong</p> : entries.map((e) => <EntryChip key={e.id} entry={e} />)}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      ) : null}
    </main>
  );
}
