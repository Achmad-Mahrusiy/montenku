import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { contentAccounts, contentItems, reminderSettings, reminders, schedules } from "@/db/schema";

// Which reminders a user wants: "2 hours before" on one item, or on every occurrence of a schedule.
// Every query filters by the owner's userId (D-008); the composite foreign keys refuse someone else's target too.

export type ReminderTarget = { itemId: string } | { scheduleId: string };
export type ReminderSetting = { id: string; offsetMinutes: number };

const targetColumn = (target: ReminderTarget) =>
  "itemId" in target ? eq(reminderSettings.itemId, target.itemId) : eq(reminderSettings.scheduleId, target.scheduleId);

async function ownsTarget(userId: string, target: ReminderTarget): Promise<boolean> {
  const [row] =
    "itemId" in target
      ? await db.select({ id: contentItems.id }).from(contentItems).where(and(eq(contentItems.id, target.itemId), eq(contentItems.userId, userId)))
      : await db.select({ id: schedules.id }).from(schedules).where(and(eq(schedules.id, target.scheduleId), eq(schedules.userId, userId)));
  return Boolean(row);
}

export async function listReminderSettings(userId: string, target: ReminderTarget): Promise<ReminderSetting[]> {
  return db
    .select({ id: reminderSettings.id, offsetMinutes: reminderSettings.offsetMinutes })
    .from(reminderSettings)
    .where(and(eq(reminderSettings.userId, userId), targetColumn(target)))
    .orderBy(asc(reminderSettings.offsetMinutes));
}

/** False when the item or schedule is not the user's. Adding an offset that already exists is a no-op. */
export async function addReminderSetting(userId: string, target: ReminderTarget, offsetMinutes: number): Promise<boolean> {
  if (!(await ownsTarget(userId, target))) return false;
  await db
    .insert(reminderSettings)
    .values({ userId, offsetMinutes, ...target })
    .onConflictDoNothing();
  return true;
}

/** Its reminders go with it (cascade); a queue message for one of them then finds no row and does nothing. */
export async function removeReminderSetting(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(reminderSettings)
    .where(and(eq(reminderSettings.id, id), eq(reminderSettings.userId, userId)))
    .returning({ id: reminderSettings.id });
  return rows.length > 0;
}

export type ReminderStatusRow = {
  id: string;
  settingId: string;
  occurrenceKey: string;
  sendAt: Date;
  status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  lastError: string | null;
};

/** The reminder rows of one item or schedule, newest first, for the status shown in the UI. */
export async function listReminderStatuses(userId: string, target: ReminderTarget): Promise<ReminderStatusRow[]> {
  return db
    .select({
      id: reminders.id,
      settingId: reminders.reminderSettingId,
      occurrenceKey: reminders.occurrenceKey,
      sendAt: reminders.sendAt,
      status: reminders.status,
      lastError: reminders.lastError,
    })
    .from(reminders)
    .innerJoin(reminderSettings, eq(reminderSettings.id, reminders.reminderSettingId))
    .where(and(eq(reminders.userId, userId), targetColumn(target)))
    .orderBy(desc(reminders.sendAt));
}

/**
 * "Kirim ulang": puts a failed reminder back to pending with a fresh attempt count. The next reconcile() sends it
 * right away if it is due, or queues it. Its Resend key is unchanged, so an email that did go out is not repeated.
 */
export async function retryFailedReminder(userId: string, reminderId: string): Promise<boolean> {
  const rows = await db
    .update(reminders)
    .set({ status: "pending", attempts: 0, lastError: null, claimedAt: null, enqueuedSendAt: null })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId), eq(reminders.status, "failed")))
    .returning({ id: reminders.id });
  return rows.length > 0;
}

export type ReminderSummary = Pick<ReminderStatusRow, "occurrenceKey" | "sendAt" | "status"> & {
  itemId: string | null;
  scheduleId: string | null;
  offsetMinutes: number;
};

/** Reminder rows of these items and schedules in one query, for the reminder line on the dashboard. */
export async function listReminderSummaries(userId: string, ids: { itemIds: string[]; scheduleIds: string[] }): Promise<ReminderSummary[]> {
  if (ids.itemIds.length === 0 && ids.scheduleIds.length === 0) return [];
  return db
    .select({
      itemId: reminderSettings.itemId,
      scheduleId: reminderSettings.scheduleId,
      offsetMinutes: reminderSettings.offsetMinutes,
      occurrenceKey: reminders.occurrenceKey,
      sendAt: reminders.sendAt,
      status: reminders.status,
    })
    .from(reminders)
    .innerJoin(reminderSettings, eq(reminderSettings.id, reminders.reminderSettingId))
    .where(
      and(
        eq(reminders.userId, userId),
        or(
          ids.itemIds.length ? inArray(reminderSettings.itemId, ids.itemIds) : undefined,
          ids.scheduleIds.length ? inArray(reminderSettings.scheduleId, ids.scheduleIds) : undefined,
        ),
      ),
    );
}

export type FailedReminder = { id: string; offsetMinutes: number; title: string; accountName: string; href: string };

/** Failed reminders whose posting time is after `since`, for the dashboard alert. Newest posting first. */
export async function listFailedReminders(userId: string, since: Date): Promise<FailedReminder[]> {
  const rows = await db
    .select({
      id: reminders.id,
      offsetMinutes: reminderSettings.offsetMinutes,
      itemId: reminderSettings.itemId,
      itemTitle: contentItems.title,
      scheduleId: reminderSettings.scheduleId,
      scheduleTitle: schedules.title,
      accountName: contentAccounts.name,
    })
    .from(reminders)
    .innerJoin(reminderSettings, eq(reminderSettings.id, reminders.reminderSettingId))
    .leftJoin(contentItems, eq(contentItems.id, reminderSettings.itemId))
    .leftJoin(schedules, eq(schedules.id, reminderSettings.scheduleId))
    .innerJoin(contentAccounts, or(eq(contentAccounts.id, contentItems.accountId), eq(contentAccounts.id, schedules.accountId)))
    .where(and(eq(reminders.userId, userId), eq(reminders.status, "failed"), gte(reminders.targetAt, since)))
    .orderBy(desc(reminders.targetAt));
  // Each failed row has its "Kirim ulang" button on the item page, or in the schedule editor.
  return rows.map((r) => ({
    id: r.id,
    offsetMinutes: r.offsetMinutes,
    title: r.itemTitle ?? r.scheduleTitle ?? "",
    accountName: r.accountName,
    href: r.itemId ? `/konten/${r.itemId}` : `/jadwal?ubah=${r.scheduleId}`,
  }));
}
