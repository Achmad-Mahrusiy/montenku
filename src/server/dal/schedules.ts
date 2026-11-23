import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { contentAccounts, contentItems, scheduleExceptions, schedules } from "@/db/schema";
import { isOccurrence, type ExceptionIn } from "@/lib/occurrences";
import { wallTimeToInstant } from "@/lib/time";
import type { ScheduleInput } from "@/lib/validation/schedule";

// Same rule as every DAL module: each query filters by the owner's userId (DECISIONS.md D-008).

type Account = { id: string; name: string; color: string; timezone: string; archivedAt: Date | null };
export type Schedule = {
  id: string;
  title: string;
  rrule: string;
  /** "YYYY-MM-DDTHH:mm", wall-clock time in the account's timezone. */
  dtstartLocal: string;
  account: Account;
  exceptions: ExceptionIn[];
};
export type FilledSlot = { scheduleId: string; occurrenceKey: string; itemId: string; title: string; targetAt: Date };

// Postgres returns "2026-11-03 19:00:00" for a timestamp without zone; the app uses "2026-11-03T19:00".
const wall = (value: string) => value.replace(" ", "T").slice(0, 16);

const accountColumns = {
  id: contentAccounts.id,
  name: contentAccounts.name,
  color: contentAccounts.color,
  timezone: contentAccounts.timezone,
  archivedAt: contentAccounts.archivedAt,
};

/** Schedules with their exceptions; optionally only for some accounts. Oldest first. */
export async function listSchedules(userId: string, accountIds?: string[]): Promise<Schedule[]> {
  const rows = await db
    .select({ id: schedules.id, title: schedules.title, rrule: schedules.rrule, dtstartLocal: schedules.dtstartLocal, account: accountColumns })
    .from(schedules)
    .innerJoin(contentAccounts, eq(contentAccounts.id, schedules.accountId))
    .where(and(eq(schedules.userId, userId), accountIds?.length ? inArray(schedules.accountId, accountIds) : undefined))
    .orderBy(asc(schedules.createdAt));
  if (rows.length === 0) return [];

  const exceptions = await db
    .select()
    .from(scheduleExceptions)
    .where(and(eq(scheduleExceptions.userId, userId), inArray(scheduleExceptions.scheduleId, rows.map((r) => r.id))));
  return rows.map((r) => ({
    ...r,
    dtstartLocal: wall(r.dtstartLocal),
    exceptions: exceptions
      .filter((e) => e.scheduleId === r.id)
      .map((e) => ({ occurrenceKey: e.occurrenceKey, kind: e.kind, movedToLocal: e.movedToLocal ? wall(e.movedToLocal) : null })),
  }));
}

export async function getSchedule(userId: string, id: string): Promise<Schedule | null> {
  return (await listSchedules(userId)).find((s) => s.id === id) ?? null;
}

async function ownedAccount(userId: string, accountId: string) {
  const [row] = await db
    .select(accountColumns)
    .from(contentAccounts)
    .where(and(eq(contentAccounts.id, accountId), eq(contentAccounts.userId, userId)));
  return row ?? null;
}

/** Returns null when the account is not the user's or is archived. */
export async function createSchedule(userId: string, input: ScheduleInput): Promise<string | null> {
  const account = await ownedAccount(userId, input.accountId);
  if (!account || account.archivedAt) return null;
  const [row] = await db.insert(schedules).values({ ...input, userId }).returning({ id: schedules.id });
  return row?.id ?? null;
}

/**
 * Edits the rule in place (Q3): old exceptions whose key no longer matches are simply ignored.
 * Moving the schedule to another account unlinks its filled slots, because those items stay on their own account.
 */
export async function updateSchedule(userId: string, id: string, input: ScheduleInput): Promise<boolean> {
  const current = await getSchedule(userId, id);
  if (!current) return false;
  const account = await ownedAccount(userId, input.accountId);
  if (!account || (account.archivedAt && account.id !== current.account.id)) return false;

  return db.transaction(async (tx) => {
    if (account.id !== current.account.id) {
      await tx
        .update(contentItems)
        .set({ scheduleId: null, occurrenceKey: null })
        .where(and(eq(contentItems.scheduleId, id), eq(contentItems.userId, userId)));
    }
    const rows = await tx
      .update(schedules)
      .set(input)
      .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
      .returning({ id: schedules.id });
    return rows.length > 0;
  });
}

/** Exceptions go with it; items that filled its slots are kept as ordinary items. */
export async function deleteSchedule(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ scheduleId: null, occurrenceKey: null })
      .where(and(eq(contentItems.scheduleId, id), eq(contentItems.userId, userId)));
    const rows = await tx
      .delete(schedules)
      .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
      .returning({ id: schedules.id });
    return rows.length > 0;
  });
}

/** Skip one occurrence, or move it to another wall-clock time. False when not the user's or not a real occurrence. */
export async function setException(
  userId: string,
  scheduleId: string,
  key: string,
  change: { kind: "skip" } | { kind: "move"; movedToLocal: string },
): Promise<boolean> {
  const schedule = await getSchedule(userId, scheduleId);
  if (!schedule || !isOccurrence(toRule(schedule), key)) return false;
  const movedToLocal = change.kind === "move" ? change.movedToLocal : null;
  await db
    .insert(scheduleExceptions)
    .values({ userId, scheduleId, occurrenceKey: key, kind: change.kind, movedToLocal })
    .onConflictDoUpdate({ target: [scheduleExceptions.scheduleId, scheduleExceptions.occurrenceKey], set: { kind: change.kind, movedToLocal } });
  return true;
}

/** Undo a skip or a move. */
export async function clearException(userId: string, scheduleId: string, key: string): Promise<boolean> {
  const rows = await db
    .delete(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.scheduleId, scheduleId),
        eq(scheduleExceptions.userId, userId),
        eq(scheduleExceptions.occurrenceKey, key),
      ),
    )
    .returning({ id: scheduleExceptions.id });
  return rows.length > 0;
}

/** Slots that already have an item ("Terisi"). */
export async function listFilledSlots(userId: string, scheduleIds: string[]): Promise<FilledSlot[]> {
  if (scheduleIds.length === 0) return [];
  const rows = await db
    .select({
      scheduleId: contentItems.scheduleId,
      occurrenceKey: contentItems.occurrenceKey,
      itemId: contentItems.id,
      title: contentItems.title,
      targetAt: contentItems.targetAt,
    })
    .from(contentItems)
    .where(and(eq(contentItems.userId, userId), isNotNull(contentItems.scheduleId), inArray(contentItems.scheduleId, scheduleIds)));
  // The check constraint guarantees both are set together; this narrows the types.
  return rows.flatMap((r) => (r.scheduleId && r.occurrenceKey ? [{ ...r, scheduleId: r.scheduleId, occurrenceKey: r.occurrenceKey }] : []));
}

/**
 * "Isi konten": creates the item for one slot, at the slot's time (its moved time, if moved), titled like the schedule.
 * Returns the item id; the existing one if the slot is already filled. Null when the slot is not the user's,
 * not a real occurrence, skipped, or on an archived account.
 */
export async function fillSlot(userId: string, scheduleId: string, key: string): Promise<string | null> {
  const schedule = await getSchedule(userId, scheduleId);
  if (!schedule || schedule.account.archivedAt) return null;
  const rule = toRule(schedule);
  if (!isOccurrence(rule, key)) return null;
  const exception = schedule.exceptions.find((e) => e.occurrenceKey === key);
  if (exception?.kind === "skip") return null;

  const existing = await listFilledSlots(userId, [scheduleId]);
  const already = existing.find((s) => s.occurrenceKey === key);
  if (already) return already.itemId;

  const wallTime = exception?.kind === "move" && exception.movedToLocal ? exception.movedToLocal : key;

  const [row] = await db
    .insert(contentItems)
    .values({ userId, accountId: schedule.account.id, title: schedule.title, targetAt: wallTimeToInstant(wallTime, rule.timezone), scheduleId, occurrenceKey: key })
    // A double click lands here twice; the unique (schedule_id, occurrence_key) keeps one item.
    .onConflictDoNothing({ target: [contentItems.scheduleId, contentItems.occurrenceKey] })
    .returning({ id: contentItems.id });
  return row?.id ?? (await listFilledSlots(userId, [scheduleId])).find((s) => s.occurrenceKey === key)?.itemId ?? null;
}

export const toRule = (s: Schedule) => ({ rrule: s.rrule, dtstartLocal: s.dtstartLocal, timezone: s.account.timezone });
