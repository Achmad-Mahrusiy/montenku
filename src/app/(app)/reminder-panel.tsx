import { Button } from "@/components/ui/button";
import Link from "next/link";
import { applyQuietHours, instantToWallTime, timezoneShortName } from "@/lib/time";
import { cn } from "@/lib/utils";
import { channelLabels, offsetLabel, reminderOffsets } from "@/lib/validation/reminder";
import type { UserSettings } from "@/lib/validation/user-settings";
import { addReminderAction, removeReminderAction, retryReminderAction } from "@/server/actions/reminders";
import type { ReminderSetting, ReminderStatusRow, ReminderTarget } from "@/server/dal/reminder-settings";

// "Pengingat" from the Figma item and schedule screens (there "Pengingat email"; push came in Fase 6, D-037).
// Server-rendered: every button is a small form.

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

function Badge({ status, channel }: { status: ReminderStatusRow["status"] | "late"; channel?: ReminderStatusRow["channel"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
        status === "failed" ? "border border-destructive/40 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {channel ? `${channelLabels[channel]}: ` : null}
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
  /** Email on/off and quiet hours from Pengaturan (D-032). */
  userSettings: UserSettings;
  /** Devices with push on (D-037); 0 = no push reminders. */
  pushDevices: number;
};

export function ReminderPanel({ target, settings, statuses, timeZone, targetAt, now, userSettings, pushDevices }: Props) {
  const unused = reminderOffsets.filter((o) => !settings.some((s) => s.offsetMinutes === o));
  const forSchedule = "scheduleId" in target;
  const failed = forSchedule ? statuses.filter((r) => r.status === "failed") : [];

  return (
    <section data-reveal aria-labelledby="reminders-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h2 id="reminders-title" className="font-heading text-xl font-bold">
          {forSchedule ? "Pengingat untuk tiap kemunculan" : "Pengingat"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dikirim lewat email dan notifikasi push yang menyala di Pengaturan. Waktu ditampilkan dalam zona akun ({timezoneShortName(timeZone, now)}).
        </p>
      </div>

      {userSettings.emailEnabled ? null : (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {pushDevices === 0
            ? "Email dan notifikasi push sedang mati, jadi tidak ada yang dikirim."
            : "Email pengingat sedang mati, jadi pengingat hanya muncul sebagai notifikasi push."}{" "}
          <Link href="/pengaturan" className="font-semibold underline underline-offset-4">
            Buka Pengaturan
          </Link>
        </p>
      )}

      {settings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pengingat.</p>
      ) : (
        <ul className="divide-y border-t">
          {settings.map((setting) => {
            // An item has one row per setting and channel; rows exist once within 48 hours (D-005, D-036).
            const rows = forSchedule ? [] : statuses.filter((r) => r.settingId === setting.id);
            // The rows know the real send time (quiet hours applied); before they exist, work it out the same way.
            const sendAt =
              rows[0]?.sendAt ??
              (targetAt
                ? applyQuietHours(new Date(targetAt.getTime() - setting.offsetMinutes * 60_000), targetAt, userSettings.quiet, userSettings.timezone)
                : null);
            const status = targetAt && targetAt <= now ? "late" : "pending";
            return (
              <li key={setting.id} className="grid gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{offsetLabel(setting.offsetMinutes)}</p>
                    {sendAt ? <p className="text-sm text-muted-foreground">{formatInZone(sendAt, timeZone)}</p> : null}
                  </div>
                  {forSchedule ? null : rows.length === 0 ? (
                    <Badge status={status} />
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      {rows.map((row) => (
                        <Badge key={row.id} status={row.status} channel={row.channel} />
                      ))}
                    </div>
                  )}
                </div>
                {rows
                  .filter((row) => row.status === "failed")
                  .map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-sm text-destructive break-words">
                        {channelLabels[row.channel]} gagal 5 kali.{row.lastError ? ` Pesan terakhir: ${row.lastError}` : ""}
                      </p>
                      <RetryButton id={row.id} />
                    </div>
                  ))}
                <div className="flex flex-wrap gap-2">
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
                  <p className="text-sm font-semibold">
                    {formatWallKey(row.occurrenceKey)} · {channelLabels[row.channel]}
                  </p>
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
