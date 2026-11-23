import { Button } from "@/components/ui/button";
import { instantToWallTime, timezoneShortName } from "@/lib/time";
import { cn } from "@/lib/utils";
import { offsetLabel, reminderOffsets } from "@/lib/validation/reminder";
import { addReminderAction, removeReminderAction, retryReminderAction } from "@/server/actions/reminders";
import type { ReminderSetting, ReminderStatusRow, ReminderTarget } from "@/server/dal/reminder-settings";

// "Pengingat email" from the Figma item and schedule screens. Server-rendered: every button is a small form.

const selectClass =
  "h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm";

const dayFormat = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** An instant shown in the account's zone: "Selasa, 24 Nov, 17:00 WIB". */
function formatInZone(instant: Date, timeZone: string) {
  const wall = instantToWallTime(instant, timeZone);
  return `${dayFormat.format(new Date(`${wall}:00Z`))}, ${wall.slice(11)} ${timezoneShortName(timeZone, instant)}`;
}
const formatWallKey = (key: string) => `${dayFormat.format(new Date(`${key}:00Z`))}, ${key.slice(11)}`;

const statusText: Record<ReminderStatusRow["status"], string> = {
  pending: "Terjadwal",
  sending: "Sedang dikirim",
  sent: "Terkirim",
  cancelled: "Dibatalkan",
  failed: "Gagal",
};

function Badge({ status }: { status: ReminderStatusRow["status"] | "late" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
        status === "failed" ? "border border-destructive/40 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "late" ? "Lewat" : statusText[status]}
    </span>
  );
}

function TargetFields({ target }: { target: ReminderTarget }) {
  return "itemId" in target ? <input type="hidden" name="itemId" value={target.itemId} /> : <input type="hidden" name="scheduleId" value={target.scheduleId} />;
}

function RetryButton({ id }: { id: string }) {
  return (
    <form action={retryReminderAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline">
        Kirim ulang
      </Button>
    </form>
  );
}

type Props = {
  target: ReminderTarget;
  settings: ReminderSetting[];
  statuses: ReminderStatusRow[];
  timeZone: string;
  /** Item pages only: the posting time, to show when each reminder goes out. */
  targetAt?: Date;
  now: Date;
};

export function ReminderPanel({ target, settings, statuses, timeZone, targetAt, now }: Props) {
  const unused = reminderOffsets.filter((o) => !settings.some((s) => s.offsetMinutes === o));
  const forSchedule = "scheduleId" in target;
  const failed = forSchedule ? statuses.filter((r) => r.status === "failed") : [];

  return (
    <section aria-labelledby="reminders-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h2 id="reminders-title" className="font-heading text-xl font-bold">
          {forSchedule ? "Pengingat untuk tiap kemunculan" : "Pengingat email"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Dikirim ke email akunmu. Waktu ditampilkan dalam zona akun ({timezoneShortName(timeZone, now)}).</p>
      </div>

      {settings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pengingat.</p>
      ) : (
        <ul className="divide-y border-t">
          {settings.map((setting) => {
            // An item has one reminder per setting; its row exists once it is within 48 hours (D-005).
            const row = forSchedule ? undefined : statuses.find((r) => r.settingId === setting.id);
            const sendAt = targetAt ? new Date(targetAt.getTime() - setting.offsetMinutes * 60_000) : null;
            const status = row?.status ?? (targetAt && targetAt <= now ? "late" : "pending");
            return (
              <li key={setting.id} className="grid gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{offsetLabel(setting.offsetMinutes)}</p>
                    {sendAt ? <p className="text-sm text-muted-foreground">{formatInZone(sendAt, timeZone)}</p> : null}
                  </div>
                  {forSchedule ? null : <Badge status={status} />}
                </div>
                {row?.status === "failed" && row.lastError ? (
                  <p className="text-sm text-destructive break-words">Gagal 5 kali. Pesan terakhir: {row.lastError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {row?.status === "failed" ? <RetryButton id={row.id} /> : null}
                  <form action={removeReminderAction}>
                    <input type="hidden" name="id" value={setting.id} />
                    <Button type="submit" variant="ghost" aria-label={`Hapus pengingat ${offsetLabel(setting.offsetMinutes)}`}>
                      Hapus
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {failed.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-destructive">Pengingat yang gagal terkirim</h3>
          <ul className="grid gap-2">
            {failed.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatWallKey(row.occurrenceKey)}</p>
                  {row.lastError ? <p className="text-sm text-destructive break-words">{row.lastError}</p> : null}
                </div>
                <RetryButton id={row.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unused.length > 0 ? (
        <form action={addReminderAction} className="flex flex-wrap items-end gap-2">
          <TargetFields target={target} />
          <div className="grid min-w-0 flex-1 gap-1">
            <label htmlFor={`offset-${forSchedule ? "schedule" : "item"}`} className="text-sm font-semibold">
              Tambah pengingat
            </label>
            <select id={`offset-${forSchedule ? "schedule" : "item"}`} name="offset" className={selectClass}>
              {unused.map((o) => (
                <option key={o} value={o}>
                  {offsetLabel(o)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Tambah
          </Button>
        </form>
      ) : null}
    </section>
  );
}
