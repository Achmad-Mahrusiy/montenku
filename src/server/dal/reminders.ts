import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentAccounts, contentItems, reminderSettings, reminders, scheduleExceptions, schedules, user, userSettings } from "@/db/schema";
import { occurrencesBetween, type ExceptionIn } from "@/lib/occurrences";
import { applyQuietHours, instantToWallTime, timezoneShortName } from "@/lib/time";
import { offsetLabel } from "@/lib/validation/reminder";
import { DEFAULT_SETTINGS, quietFromRow } from "@/server/dal/user-settings";

// The reminder engine (DECISIONS.md D-005 to D-007, docs/fase-0-arsitektur.md section 4).
// reminders is the source of truth; a queue message only "knocks on the door" and the row is always re-read.
// The clock, the queue and the mailer are passed in, so tests run on a fake clock with fakes for both.

export const WINDOW_MS = 48 * 60 * 60 * 1000; // rows exist for send_at up to 48h ahead
export const LEASE_MS = 5 * 60 * 1000; // a "sending" row older than this is assumed crashed
export const MAX_ATTEMPTS = 5;
const EARLY_MS = 60 * 1000; // a queue message may arrive a little early
const RETENTION_EXTRA_S = 24 * 60 * 60; // retention = delay + 24h (D-005)

export type ReminderMessage = { id: string; sendAt: string };
export type Email = { to: string; subject: string; text: string };
export type ReminderDeps = {
  queue: { send(message: ReminderMessage, options: { delaySeconds: number; retentionSeconds: number; idempotencyKey: string }): Promise<void> };
  /** Must pass idempotencyKey on to the email provider (Resend keeps it 24h), so a retry never sends twice. */
  mailer: { send(email: Email, idempotencyKey: string): Promise<void> };
  /** Absolute base URL for links in the email, e.g. https://montenku.vercel.app */
  appUrl: string;
};

type Desired = { settingId: string; userId: string; occurrenceKey: string; targetAt: Date; sendAt: Date };

const wall = (value: string) => value.replace(" ", "T").slice(0, 16);
const minutes = (n: number) => n * 60 * 1000;

// No user_settings row means email on (D-032). Used to skip and cancel reminders of users who turned email off.
const emailOn = sql`coalesce(${userSettings.emailEnabled}, true)`;
const emailOff = sql`exists (select 1 from ${userSettings} where ${userSettings.userId} = ${reminders.userId} and not ${userSettings.emailEnabled})`;
const quietColumns = { quietStart: userSettings.quietStart, quietEnd: userSettings.quietEnd, userTimezone: userSettings.timezone };
type QuietRow = { quietStart: string | null; quietEnd: string | null; userTimezone: string | null };
/** send_at = target - offset, moved out of the user's quiet hours (Q2). */
const sendTime = (targetAt: Date, offset: number, r: QuietRow) =>
  applyQuietHours(new Date(targetAt.getTime() - minutes(offset)), targetAt, quietFromRow(r.quietStart, r.quietEnd), r.userTimezone ?? DEFAULT_SETTINGS.timezone);

/**
 * Every reminder that should exist now: target still ahead, send_at within the window.
 * Archived accounts and users with email turned off get none.
 */
async function desiredReminders(now: Date, userId?: string): Promise<Desired[]> {
  const horizon = new Date(now.getTime() + WINDOW_MS);
  const byUser = (column: typeof reminderSettings.userId) => (userId ? eq(column, userId) : undefined);
  const result: Desired[] = [];

  // Single items: one reminder per setting, key "once".
  const itemRows = await db
    .select({ settingId: reminderSettings.id, userId: reminderSettings.userId, offset: reminderSettings.offsetMinutes, targetAt: contentItems.targetAt, ...quietColumns })
    .from(reminderSettings)
    .innerJoin(contentItems, eq(contentItems.id, reminderSettings.itemId))
    .innerJoin(contentAccounts, eq(contentAccounts.id, contentItems.accountId))
    .leftJoin(userSettings, eq(userSettings.userId, reminderSettings.userId))
    .where(and(byUser(reminderSettings.userId), isNull(contentAccounts.archivedAt), gt(contentItems.targetAt, now), emailOn));
  for (const r of itemRows) {
    const sendAt = sendTime(r.targetAt, r.offset, r);
    if (sendAt <= horizon) result.push({ settingId: r.settingId, userId: r.userId, occurrenceKey: "once", targetAt: r.targetAt, sendAt });
  }

  // Recurring schedules: one reminder per occurrence. A filled slot uses its item's time (the item may have moved).
  const scheduleRows = await db
    .select({
      settingId: reminderSettings.id,
      userId: reminderSettings.userId,
      offset: reminderSettings.offsetMinutes,
      scheduleId: schedules.id,
      rrule: schedules.rrule,
      dtstartLocal: schedules.dtstartLocal,
      timezone: contentAccounts.timezone,
      ...quietColumns,
    })
    .from(reminderSettings)
    .innerJoin(schedules, eq(schedules.id, reminderSettings.scheduleId))
    .innerJoin(contentAccounts, eq(contentAccounts.id, schedules.accountId))
    .leftJoin(userSettings, eq(userSettings.userId, reminderSettings.userId))
    .where(and(byUser(reminderSettings.userId), isNull(contentAccounts.archivedAt), emailOn));
  if (scheduleRows.length === 0) return result;

  const ids = [...new Set(scheduleRows.map((r) => r.scheduleId))];
  const [exceptionRows, filledRows] = await Promise.all([
    db.select().from(scheduleExceptions).where(inArray(scheduleExceptions.scheduleId, ids)),
    db
      .select({ scheduleId: contentItems.scheduleId, key: contentItems.occurrenceKey, targetAt: contentItems.targetAt })
      .from(contentItems)
      .where(inArray(contentItems.scheduleId, ids)),
  ]);
  const filled = new Map(filledRows.map((f) => [`${f.scheduleId}|${f.key}`, f.targetAt]));

  for (const r of scheduleRows) {
    const exceptions: ExceptionIn[] = exceptionRows
      .filter((e) => e.scheduleId === r.scheduleId)
      .map((e) => ({ occurrenceKey: e.occurrenceKey, kind: e.kind, movedToLocal: e.movedToLocal ? wall(e.movedToLocal) : null }));
    const rule = { rrule: r.rrule, dtstartLocal: wall(r.dtstartLocal), timezone: r.timezone };
    // Look as far ahead as the window plus this offset, so an "H-3" reminder is created on time.
    for (const o of occurrencesBetween(rule, exceptions, now, new Date(horizon.getTime() + minutes(r.offset)))) {
      const targetAt = filled.get(`${r.scheduleId}|${o.key}`) ?? o.at;
      const sendAt = sendTime(targetAt, r.offset, r);
      if (targetAt > now && sendAt <= horizon) {
        result.push({ settingId: r.settingId, userId: r.userId, occurrenceKey: o.key, targetAt, sendAt });
      }
    }
  }
  return result;
}

export type ReconcileResult = { upserted: number; cancelled: number; recovered: number; delivered: number; enqueued: number; errors: number };

/**
 * The one idempotent job (D-005), run by the daily cron, the 15-minute sweeper, and after a user edits something
 * (then with userId). Safe to run twice at once: every step is a conditional write.
 */
export async function reconcile(deps: ReminderDeps, { now, userId }: { now: Date; userId?: string }): Promise<ReconcileResult> {
  const byUser = userId ? eq(reminders.userId, userId) : undefined;
  const result: ReconcileResult = { upserted: 0, cancelled: 0, recovered: 0, delivered: 0, enqueued: 0, errors: 0 };

  // 1. Materialise: create rows, move rows whose time changed, revive cancelled ones. sent/sending/failed stay as they are.
  const desired = await desiredReminders(now, userId);
  if (desired.length > 0) {
    const rows = await db
      .insert(reminders)
      .values(desired.map((d) => ({ userId: d.userId, reminderSettingId: d.settingId, occurrenceKey: d.occurrenceKey, targetAt: d.targetAt, sendAt: d.sendAt })))
      .onConflictDoUpdate({
        target: [reminders.reminderSettingId, reminders.occurrenceKey],
        set: {
          targetAt: sql`excluded.target_at`,
          sendAt: sql`excluded.send_at`,
          status: "pending",
          // Keep the "already queued" mark only when nothing changed; otherwise the new time must be queued.
          enqueuedSendAt: sql`case when ${reminders.status} = 'pending' and ${reminders.sendAt} = excluded.send_at then ${reminders.enqueuedSendAt} else null end`,
        },
        setWhere: inArray(reminders.status, ["pending", "cancelled"]),
      })
      .returning({ id: reminders.id });
    result.upserted = rows.length;
  }

  // 2. Cancel pending rows that are no longer wanted: item deleted or moved out of the window, occurrence skipped,
  //    setting removed, account archived, email turned off (then also overdue ones, which would otherwise go out in
  //    step 4). Their queue messages then find a non-pending row and do nothing (D-006).
  const wanted = new Set(desired.map((d) => `${d.settingId}|${d.occurrenceKey}`));
  const pending = await db
    .select({ id: reminders.id, settingId: reminders.reminderSettingId, key: reminders.occurrenceKey })
    .from(reminders)
    .where(and(byUser, eq(reminders.status, "pending"), or(gt(reminders.targetAt, now), emailOff)));
  const stale = pending.filter((p) => !wanted.has(`${p.settingId}|${p.key}`)).map((p) => p.id);
  if (stale.length > 0) {
    const rows = await db
      .update(reminders)
      .set({ status: "cancelled", enqueuedSendAt: null })
      .where(and(inArray(reminders.id, stale), eq(reminders.status, "pending")))
      .returning({ id: reminders.id });
    result.cancelled = rows.length;
  }

  // 3. Recover rows stuck in "sending" (a worker crashed after claiming). D-007.
  const recovered = await db
    .update(reminders)
    .set({ status: "pending", claimedAt: null })
    .where(and(byUser, eq(reminders.status, "sending"), lt(reminders.claimedAt, new Date(now.getTime() - LEASE_MS))))
    .returning({ id: reminders.id });
  result.recovered = recovered.length;

  // 4. Deliver what is due now, inline (the sweeper's safety net). Re-queueing would be dropped by queue dedup (D-007).
  const due = await db
    .select({ id: reminders.id, sendAt: reminders.sendAt })
    .from(reminders)
    .where(and(byUser, eq(reminders.status, "pending"), lte(reminders.sendAt, now)));
  for (const row of due) {
    try {
      if ((await deliver(deps, { id: row.id, sendAt: row.sendAt.toISOString() }, now)) === "sent") result.delivered += 1;
    } catch {
      result.errors += 1; // already recorded on the row by deliver(); the next run retries
    }
  }

  // 5. Queue the future ones that are not queued at their current time yet. A failed send stays for the next run.
  const toQueue = await db
    .select({ id: reminders.id, sendAt: reminders.sendAt })
    .from(reminders)
    .where(
      and(
        byUser,
        eq(reminders.status, "pending"),
        gt(reminders.sendAt, now),
        or(isNull(reminders.enqueuedSendAt), ne(reminders.enqueuedSendAt, reminders.sendAt)),
      ),
    );
  for (const row of toQueue) {
    const delaySeconds = Math.ceil((row.sendAt.getTime() - now.getTime()) / 1000);
    try {
      await deps.queue.send(
        { id: row.id, sendAt: row.sendAt.toISOString() },
        // Second idempotency key (D-006): id + send_at, so a moved reminder is a new message, a repeat is not.
        { delaySeconds, retentionSeconds: delaySeconds + RETENTION_EXTRA_S, idempotencyKey: `${row.id}:${row.sendAt.toISOString()}` },
      );
      await db
        .update(reminders)
        .set({ enqueuedSendAt: row.sendAt })
        .where(and(eq(reminders.id, row.id), eq(reminders.sendAt, row.sendAt)));
      result.enqueued += 1;
    } catch (error) {
      console.error("Gagal memasukkan pengingat ke antrean:", error);
      result.errors += 1;
    }
  }
  return result;
}

/**
 * Sends one reminder, at most once (D-007). Used by the queue consumer and by reconcile().
 * Returns "skipped" when the row is gone, not pending, moved to another time, or not due yet.
 * Throws when the email fails, so the queue retries; the row is back to pending (or failed after 5 attempts).
 */
export async function deliver(deps: ReminderDeps, message: ReminderMessage, now: Date): Promise<"sent" | "skipped"> {
  const sendAt = new Date(message.sendAt);
  if (Number.isNaN(sendAt.getTime())) return "skipped";

  // The claim: only one worker can move this row from pending to sending.
  const [claimed] = await db
    .update(reminders)
    .set({ status: "sending", claimedAt: now })
    .where(
      and(
        eq(reminders.id, message.id),
        eq(reminders.status, "pending"),
        eq(reminders.sendAt, sendAt),
        lte(reminders.sendAt, new Date(now.getTime() + EARLY_MS)),
        // Email turned off since this was queued: leave it for reconcile() to cancel.
        sql`not ${emailOff}`,
      ),
    )
    .returning();
  if (!claimed) return "skipped";

  try {
    const email = await composeEmail(claimed, deps.appUrl);
    // Same key on every retry of this row at this time; the provider drops the duplicate (24h).
    await deps.mailer.send(email, `reminder:${claimed.id}:${sendAt.toISOString()}`);
  } catch (error) {
    const attempts = claimed.attempts + 1;
    await db
      .update(reminders)
      .set({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        claimedAt: null,
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      })
      .where(and(eq(reminders.id, claimed.id), eq(reminders.status, "sending")));
    throw error;
  }

  await db
    .update(reminders)
    .set({ status: "sent", sentAt: now, claimedAt: null, lastError: null })
    .where(and(eq(reminders.id, claimed.id), eq(reminders.status, "sending")));
  return "sent";
}

/** Email in Indonesian: account, title, time in the account's own timezone, link to the item (brief, Fase 4). */
async function composeEmail(row: typeof reminders.$inferSelect, appUrl: string): Promise<Email> {
  const [setting] = await db
    .select({ itemId: reminderSettings.itemId, scheduleId: reminderSettings.scheduleId, offset: reminderSettings.offsetMinutes, email: user.email })
    .from(reminderSettings)
    .innerJoin(user, eq(user.id, reminderSettings.userId))
    .where(eq(reminderSettings.id, row.reminderSettingId));
  if (!setting) throw new Error("Pengaturan pengingat tidak ditemukan");

  let title: string;
  let accountName: string;
  let timezone: string;
  let path: string;
  if (setting.itemId) {
    const [item] = await db
      .select({ id: contentItems.id, title: contentItems.title, accountName: contentAccounts.name, timezone: contentAccounts.timezone })
      .from(contentItems)
      .innerJoin(contentAccounts, eq(contentAccounts.id, contentItems.accountId))
      .where(eq(contentItems.id, setting.itemId));
    if (!item) throw new Error("Konten tidak ditemukan");
    ({ title, accountName, timezone } = item);
    path = `/konten/${item.id}`;
  } else {
    const [schedule] = await db
      .select({ id: schedules.id, title: schedules.title, accountName: contentAccounts.name, timezone: contentAccounts.timezone })
      .from(schedules)
      .innerJoin(contentAccounts, eq(contentAccounts.id, schedules.accountId))
      .where(eq(schedules.id, setting.scheduleId ?? ""));
    if (!schedule) throw new Error("Jadwal tidak ditemukan");
    const [filledItem] = await db
      .select({ id: contentItems.id, title: contentItems.title })
      .from(contentItems)
      .where(and(eq(contentItems.scheduleId, schedule.id), eq(contentItems.occurrenceKey, row.occurrenceKey), isNotNull(contentItems.scheduleId)));
    ({ accountName, timezone } = schedule);
    title = filledItem?.title ?? schedule.title;
    path = filledItem ? `/konten/${filledItem.id}` : `/jadwal?ubah=${schedule.id}`;
  }

  const local = instantToWallTime(row.targetAt, timezone);
  const when = `${new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${local}:00Z`))}, ${local.slice(11)} ${timezoneShortName(timezone, row.targetAt)}`;
  return {
    to: setting.email,
    subject: `Pengingat: ${title} (${accountName})`,
    text: [
      `${offsetLabel(setting.offset)}: "${title}" di akun ${accountName}.`,
      `Waktu posting: ${when}`,
      "",
      `Buka di Montenku: ${appUrl.replace(/\/$/, "")}${path}`,
    ].join("\n"),
  };
}
