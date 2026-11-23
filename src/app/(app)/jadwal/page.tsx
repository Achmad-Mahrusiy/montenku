import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CALENDAR_HOME_TIMEZONE } from "@/lib/calendar";
import { occurrencesBetween, type Occurrence } from "@/lib/occurrences";
import { timezoneShortName, todayIn } from "@/lib/time";
import { cn } from "@/lib/utils";
import { describeWeekly, readWeeklyRrule, scheduleIdSchema } from "@/lib/validation/schedule";
import {
  deleteScheduleAction,
  fillSlotAction,
  moveOccurrenceAction,
  restoreOccurrenceAction,
  skipOccurrenceAction,
} from "@/server/actions/schedules";
import { listFilledSlots, listSchedules, toRule, type FilledSlot, type Schedule } from "@/server/dal/schedules";
import { requireUser } from "@/server/dal/session";
import { accountOptions } from "../konten/form-data";
import { ScheduleForm, type ScheduleFormValues } from "./schedule-form";

export const metadata: Metadata = { title: "Jadwal berulang | Montenku" };

const UPCOMING = 8;

// The next ~2 months from now; enough for 8 occurrences of any weekly rule.
function upcomingWindow() {
  const from = new Date();
  return { from, to: new Date(from.getTime() + 62 * 24 * 60 * 60 * 1000) };
}

const dayFormat = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** "2026-11-24T19:00" -> "Selasa, 24 Nov, 19:00" (wall-clock time, so formatted as if it were UTC). */
const formatWall = (wall: string) => `${dayFormat.format(new Date(`${wall}:00Z`))}, ${wall.slice(11, 16)}`;

type Row = Occurrence & { filled?: FilledSlot };

function upcoming(schedule: Schedule, filled: FilledSlot[], withSkipped: boolean): Row[] {
  const { from, to } = upcomingWindow();
  return occurrencesBetween(toRule(schedule), schedule.exceptions, from, to, { withSkipped })
    .map((o) => ({ ...o, filled: filled.find((f) => f.scheduleId === schedule.id && f.occurrenceKey === o.key) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, UPCOMING);
}

const badge: Record<string, { text: string; className: string }> = {
  slot: { text: "Slot kosong", className: "bg-muted text-muted-foreground" },
  filled: { text: "Terisi", className: "bg-marker text-marker-foreground" },
  skipped: { text: "Dilewati", className: "bg-muted text-muted-foreground" },
  moved: { text: "Digeser", className: "bg-muted text-muted-foreground" },
};

function OccurrenceRow({ scheduleId, row }: { scheduleId: string; row: Row }) {
  const kind = row.state === "skipped" ? "skipped" : row.filled ? "filled" : row.state === "moved" ? "moved" : "slot";
  const hidden = (
    <>
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="key" value={row.key} />
    </>
  );
  return (
    <li className="grid gap-2 py-4">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span className={cn(kind === "skipped" && "line-through")}>{formatWall(row.key)}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", badge[kind]?.className)}>{badge[kind]?.text}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {kind === "filled" ? row.filled?.title : null}
        {kind === "slot" ? "Belum ada konten" : null}
        {kind === "skipped" ? "Tanggal ini tidak dijadwalkan" : null}
        {kind === "moved" ? `Pindah ke ${formatWall(row.wallTime)}` : null}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        {row.filled ? (
          <Button asChild variant="outline">
            <Link href={`/konten/${row.filled.itemId}`}>Buka konten</Link>
          </Button>
        ) : kind === "skipped" ? (
          <form action={restoreOccurrenceAction}>
            {hidden}
            <Button type="submit" variant="outline">
              Batalkan lewati
            </Button>
          </form>
        ) : (
          <>
            <form action={fillSlotAction}>
              {hidden}
              <Button type="submit" variant="outline">
                Isi konten
              </Button>
            </form>
            {kind === "moved" ? (
              <form action={restoreOccurrenceAction}>
                {hidden}
                <Button type="submit" variant="outline">
                  Kembalikan
                </Button>
              </form>
            ) : (
              <>
                <form action={skipOccurrenceAction}>
                  {hidden}
                  <Button type="submit" variant="outline">
                    Lewati
                  </Button>
                </form>
                {/* Native disclosure: opens the move form without any client JavaScript. */}
                <details className="group">
                  <summary className="flex h-11 cursor-pointer list-none items-center rounded-lg border bg-card px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                    Geser
                  </summary>
                  <form action={moveOccurrenceAction} className="mt-2 flex flex-wrap items-end gap-2">
                    {hidden}
                    <div className="grid gap-1">
                      <label htmlFor={`move-${row.key}`} className="text-sm font-semibold">
                        Geser ke
                      </label>
                      <Input id={`move-${row.key}`} name="movedTo" type="datetime-local" required defaultValue={row.key} />
                    </div>
                    <Button type="submit">Simpan geser</Button>
                  </form>
                </details>
              </>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ baru?: string; ubah?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [schedules, accounts] = await Promise.all([listSchedules(user.id), accountOptions(user.id)]);
  const filled = await listFilledSlots(user.id, schedules.map((s) => s.id));
  const now = upcomingWindow().from;

  // The editor panel is driven by the URL (?baru=1 or ?ubah=<id>), like the content accounts page.
  const editId = scheduleIdSchema.safeParse(params.ubah);
  const editing = editId.success ? schedules.find((s) => s.id === editId.data) : undefined;
  const panel = editing ? "ubah" : params.baru ? "baru" : params.ubah ? "hilang" : null;

  const firstAccount = accounts[0];
  const editedRule = editing ? readWeeklyRrule(editing.rrule) : null;
  const initial: ScheduleFormValues | null = editing
    ? {
        accountId: editing.account.id,
        title: editing.title,
        days: editedRule?.days ?? [],
        endDate: editedRule?.endDate ?? "",
        time: editing.dtstartLocal.slice(11, 16),
        startDate: editing.dtstartLocal.slice(0, 10),
      }
    : firstAccount
      ? { accountId: firstAccount.id, title: "", days: [], time: "", startDate: todayIn(CALENDAR_HOME_TIMEZONE), endDate: "" }
      : null;
  const rows = editing ? upcoming(editing, filled, true) : [];
  // Editing a schedule on an archived account must still list that account.
  const formAccounts = editing ? await accountOptions(user.id, editing.account.id) : accounts;

  if (accounts.length === 0 && schedules.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <h1 className="font-heading text-3xl font-bold">Jadwal berulang</h1>
        <section className="mt-6 rounded-xl border border-dashed bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
          <p className="mt-1 text-sm text-muted-foreground">Setiap jadwal milik satu akun konten. Tambahkan akun kontennya dulu.</p>
          <Button asChild className="mt-4">
            <Link href="/akun-konten?tambah=1">Tambah akun konten</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold">Jadwal berulang</h1>
        {panel !== "baru" && accounts.length > 0 ? (
          <Button asChild>
            <Link href="/jadwal?baru=1">
              Buat<span className="hidden sm:inline">&nbsp;jadwal berulang</span>
            </Link>
          </Button>
        ) : null}
      </div>

      <div className={cn("mt-6 grid gap-6 lg:items-start", panel && "lg:grid-cols-[280px_minmax(0,1fr)]")}>
        {/* On phones the open panel comes first, as on the content accounts page. */}
        {panel ? (
          <div className="grid gap-6 lg:order-last">
            <section aria-labelledby="panel-title" className="@container rounded-xl border bg-card p-5 sm:p-6">
              {panel === "hilang" || !initial ? (
                <>
                  <h2 id="panel-title" className="font-heading text-xl font-bold">
                    Jadwal tidak ditemukan
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">Mungkin tautannya salah. Pilih jadwal dari daftar.</p>
                </>
              ) : (
                <>
                  <h2 id="panel-title" className="mb-5 font-heading text-xl font-bold break-words">
                    {editing ? editing.title : "Jadwal berulang baru"}
                  </h2>
                  <ScheduleForm key={editing?.id ?? "baru"} scheduleId={editing?.id} initial={initial} accounts={formAccounts} />
                  <div className="mt-3 flex flex-wrap gap-3">
                    {editing ? (
                      <ConfirmDeleteButton id={editing.id} label="Hapus jadwal" question="Hapus jadwal ini?" action={deleteScheduleAction}>
                        Jadwal <span className="font-semibold text-foreground break-words">{editing.title}</span> beserta tanggal yang
                        dilewati dan digeser akan terhapus. Konten yang sudah dibuat dari jadwal ini tetap ada.
                      </ConfirmDeleteButton>
                    ) : null}
                    <Button asChild variant="ghost">
                      <Link href="/jadwal">Tutup</Link>
                    </Button>
                  </div>
                </>
              )}
            </section>

            {editing ? (
              <section aria-labelledby="upcoming-title" className="rounded-xl border bg-card p-5 sm:p-6">
                <h2 id="upcoming-title" className="font-heading text-xl font-bold">
                  Kemunculan berikutnya
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Lewati atau geser satu tanggal tanpa mengubah aturannya.</p>
                {rows.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Tidak ada kemunculan dalam 2 bulan ke depan.</p>
                ) : (
                  <ul className="mt-2 divide-y border-t">
                    {rows.map((row) => (
                      <OccurrenceRow key={row.key} scheduleId={editing.id} row={row} />
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        {schedules.length === 0 ? (
          <section className="rounded-xl border border-dashed bg-card p-6">
            <h2 className="font-heading text-lg font-bold">Belum ada jadwal berulang</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Simpan kebiasaan posting, misalnya &quot;upload tiap Selasa dan Jumat 19:00&quot;, sekali saja. Tanggal-tanggalnya dihitung otomatis.
            </p>
          </section>
        ) : (
          <ul className="grid content-start gap-3" aria-label="Daftar jadwal berulang">
            {schedules.map((s) => {
              const next = upcoming(s, filled, false)[0];
              return (
                <li key={s.id}>
                  <Link
                    href={`/jadwal?ubah=${s.id}`}
                    aria-current={s.id === editing?.id ? "page" : undefined}
                    className={cn(
                      "block rounded-xl border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                      s.id === editing?.id && "border-2 border-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: s.account.color }} />
                      {s.account.name}
                    </span>
                    <span className="mt-1 block font-heading text-lg font-bold break-words">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {describeWeekly(s.rrule, s.dtstartLocal)} {timezoneShortName(s.account.timezone, now)}
                    </span>
                    {next ? (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Berikutnya: {formatWall(next.wallTime)}, {next.filled ? next.filled.title : "slot kosong"}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
