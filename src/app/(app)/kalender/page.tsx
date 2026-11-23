import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { placeOnCalendar, scheduleSlots } from "@/lib/calendar";
import {
  addDays,
  addMonths,
  isPlainDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  timezoneShortName,
  todayIn,
  utcRangeCovering,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { listContentAccounts } from "@/server/dal/content-accounts";
import { listContentItems } from "@/server/dal/content-items";
import { listFilledSlots, listSchedules } from "@/server/dal/schedules";
import { requireUser } from "@/server/dal/session";
import { getUserSettings } from "@/server/dal/user-settings";
import { ListView, MonthView, WeekView, dayNumber } from "./views";

export const metadata: Metadata = { title: "Kalender | Montenku" };

const views = ["bulan", "minggu", "daftar"] as const;
type View = (typeof views)[number];
const viewLabels: Record<View, string> = { bulan: "Bulan", minggu: "Minggu", daftar: "Daftar" };

// Everything the calendar shows comes from the URL, so a view can be refreshed, bookmarked or shared.
// Bad values fall back to defaults instead of erroring.
function readParams(raw: Record<string, string | string[] | undefined>, today: string) {
  const one = (key: string) => (typeof raw[key] === "string" ? raw[key] : undefined);
  return {
    view: z.enum(views).catch("bulan").parse(one("tampilan")),
    date: z.string().refine(isPlainDate).catch(today).parse(one("tanggal") ?? today),
    accountId: z.uuid().optional().catch(undefined).parse(one("akun")),
  };
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" });
const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const monthLabel = (date: string) => fmt({ month: "long", year: "numeric" }).format(asUtc(date));
const shortMonth = fmt({ month: "short" });

function weekLabel(monday: string) {
  const sunday = addDays(monday, 6);
  const end = `${dayNumber(sunday)} ${shortMonth.format(asUtc(sunday))}`;
  return monday.slice(0, 7) === sunday.slice(0, 7)
    ? `${dayNumber(monday)} sampai ${end}`
    : `${dayNumber(monday)} ${shortMonth.format(asUtc(monday))} sampai ${end}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { timezone: homeZone } = await getUserSettings(user.id);
  const today = todayIn(homeZone);
  const { view, date, accountId } = readParams(await searchParams, today);

  const href = (next: Partial<{ view: View; date: string; accountId: string | null }>) => {
    const params = new URLSearchParams({ tampilan: next.view ?? view, tanggal: next.date ?? date });
    const account = next.accountId === undefined ? accountId : next.accountId;
    if (account) params.set("akun", account);
    return `/kalender?${params}`;
  };

  // Which dates are on screen, per view.
  const weeks = monthGrid(date);
  const monday = startOfWeek(date);
  const monthStart = startOfMonth(date);
  const monthDates = Array.from({ length: 31 }, (_, i) => addDays(monthStart, i)).filter((d) => d.slice(0, 7) === monthStart.slice(0, 7));
  const shown =
    view === "minggu"
      ? Array.from({ length: 7 }, (_, i) => addDays(monday, i))
      : view === "daftar"
        ? monthDates
        : weeks.flat();
  const first = shown[0] ?? date;
  const last = shown.at(-1) ?? date;

  const range = utcRangeCovering(first, last);
  const accountIds = accountId ? [accountId] : undefined;
  const [accounts, items, schedules] = await Promise.all([
    listContentAccounts(user.id),
    // The DAL filters by user, so an account id from someone else simply returns nothing.
    listContentItems(user.id, { ...range, accountIds }),
    listSchedules(user.id, accountIds),
  ]);
  const filled = await listFilledSlots(user.id, schedules.map((s) => s.id));
  const days = placeOnCalendar([...items, ...scheduleSlots(schedules, filled, range.from, range.to)], homeZone);
  // The query range is padded for every timezone; only count what actually lands on screen.
  const onScreen = shown.flatMap((d) => days.get(d) ?? []);
  const visibleCount = onScreen.length;
  const hasSlots = onScreen.some((e) => e.slotOf);
  const activeAccounts = accounts.filter((a) => !a.archivedAt);

  const step = view === "minggu" ? { prev: addDays(date, -7), next: addDays(date, 7), unit: "Minggu" } : { prev: addMonths(date, -1), next: addMonths(date, 1), unit: "Bulan" };
  const title = view === "minggu" ? weekLabel(monday) : monthLabel(date);
  const newItemHref = accountId ? `/konten/baru?akun=${accountId}` : "/konten/baru";

  if (accounts.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <h1 className="font-heading text-3xl font-bold">Kalender</h1>
        <section className="mt-6 rounded-xl border border-dashed bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
          <p className="mt-1 text-sm text-muted-foreground">Kalender menampilkan konten per akun. Tambahkan akun kontennya dulu.</p>
          <Button asChild className="mt-4">
            <Link href="/akun-konten?tambah=1">Tambah akun konten</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-heading text-3xl font-bold">{title}</h1>
        <nav aria-label="Pindah periode" className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={href({ date: step.prev })}>
              {step.unit} lalu
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={href({ date: today })}>Hari ini</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={href({ date: step.next })}>
              {step.unit} depan
            </Link>
          </Button>
        </nav>
        <nav aria-label="Tampilan kalender" className="flex gap-1 rounded-lg bg-muted p-1">
          {views.map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={v === view ? "page" : undefined}
              className={cn(
                "flex h-11 items-center rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                v === view ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {viewLabels[v]}
            </Link>
          ))}
        </nav>
        <Button asChild>
          <Link href={newItemHref}>Buat konten baru</Link>
        </Button>
      </div>

      <nav aria-label="Filter akun konten" className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Tampilkan:</span>
        {[{ id: null, name: "Semua akun", color: null }, ...activeAccounts].map((a) => {
          const active = (a.id ?? undefined) === accountId;
          return (
            <Link
              key={a.id ?? "semua"}
              href={href({ accountId: a.id })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              {a.color ? <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: a.color }} /> : null}
              {a.name}
            </Link>
          );
        })}
      </nav>

      {hasSlots ? (
        // Legend from the Figma calendar: what a dashed entry means.
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="rounded-md border border-dashed border-foreground/50 bg-card px-2 py-0.5 text-xs">
            Slot kosong
          </span>
          Garis putus = slot jadwal berulang yang belum diisi konten.
        </p>
      ) : null}

      {visibleCount === 0 ? (
        <p role="status" className="mt-5 rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
          Belum ada konten di {view === "minggu" ? "minggu" : "bulan"} ini{accountId ? " untuk akun ini" : ""}.{" "}
          <Link href={newItemHref} className="font-semibold text-foreground underline underline-offset-4">
            Buat konten baru
          </Link>
        </p>
      ) : null}

      <div className="mt-5">
        {view === "bulan" ? (
          <MonthView
            weeks={weeks}
            month={date.slice(0, 7)}
            days={days}
            today={today}
            dayHref={(d) => `${href({ view: "daftar", date: d })}#hari-${d}`}
          />
        ) : view === "minggu" ? (
          <WeekView monday={monday} days={days} today={today} zoneLabel={timezoneShortName(homeZone, new Date(`${monday}T12:00:00Z`))} />
        ) : (
          <ListView dates={monthDates} days={days} today={today} />
        )}
      </div>
    </main>
  );
}
