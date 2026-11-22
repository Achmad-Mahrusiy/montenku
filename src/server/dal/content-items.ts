import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { contentAccounts, contentItems, itemStageDeadlines, notes } from "@/db/schema";
import { wallTimeToInstant } from "@/lib/time";
import { deadlineStages, type ContentItemInput, type DeadlineStage } from "@/lib/validation/content-item";

// Same rule as the content account DAL: every query filters by the owner's userId (DECISIONS.md D-008).

export type ContentItem = typeof contentItems.$inferSelect;
export type Note = typeof notes.$inferSelect;
type Account = Pick<typeof contentAccounts.$inferSelect, "id" | "name" | "color" | "timezone" | "archivedAt">;
export type ContentItemDetail = ContentItem & { account: Account; deadlines: { stage: DeadlineStage; dueAt: Date }[] };
export type CalendarItem = Pick<ContentItem, "id" | "title" | "status" | "targetAt"> & { account: Omit<Account, "archivedAt"> };

const accountColumns = {
  id: contentAccounts.id,
  name: contentAccounts.name,
  color: contentAccounts.color,
  timezone: contentAccounts.timezone,
  archivedAt: contentAccounts.archivedAt,
};

async function ownedAccount(userId: string, accountId: string): Promise<Account | null> {
  const [row] = await db
    .select(accountColumns)
    .from(contentAccounts)
    .where(and(eq(contentAccounts.id, accountId), eq(contentAccounts.userId, userId)));
  return row ?? null;
}

// Wall-clock input -> rows to store, using the account's timezone.
function toRows(input: ContentItemInput, timezone: string) {
  const item = {
    title: input.title,
    description: input.description,
    accountId: input.accountId,
    status: input.status,
    tags: input.tags,
    targetAt: wallTimeToInstant(input.targetWallTime, timezone),
  };
  const deadlines = deadlineStages.flatMap((stage) => {
    const wall = input.deadlines[stage];
    return wall ? [{ stage, dueAt: wallTimeToInstant(wall, timezone) }] : [];
  });
  return { item, deadlines };
}

/** Returns null when the account is not the user's or is archived (no new content on archived accounts). */
export async function createContentItem(userId: string, input: ContentItemInput): Promise<ContentItem | null> {
  const account = await ownedAccount(userId, input.accountId);
  if (!account || account.archivedAt) return null;
  const { item, deadlines } = toRows(input, account.timezone);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contentItems)
      .values({ ...item, userId })
      .returning();
    if (!created) throw new Error("Insert content_items tidak mengembalikan baris");
    if (deadlines.length) {
      await tx.insert(itemStageDeadlines).values(deadlines.map((d) => ({ ...d, itemId: created.id, userId })));
    }
    return created;
  });
}

/** Returns false when the item or the (new) account is not the user's, or the item moves to an archived account. */
export async function updateContentItem(userId: string, id: string, input: ContentItemInput): Promise<boolean> {
  const [current] = await db
    .select({ accountId: contentItems.accountId })
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.userId, userId)));
  if (!current) return false;

  const account = await ownedAccount(userId, input.accountId);
  // Editing an item on an archived account is fine; moving an item onto one is not.
  if (!account || (account.archivedAt && account.id !== current.accountId)) return false;
  const { item, deadlines } = toRows(input, account.timezone);

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(contentItems)
      .set(item)
      .where(and(eq(contentItems.id, id), eq(contentItems.userId, userId)))
      .returning({ id: contentItems.id });
    if (updated.length === 0) return false;
    // Deadlines are a small fixed set, so replace them instead of diffing.
    await tx.delete(itemStageDeadlines).where(and(eq(itemStageDeadlines.itemId, id), eq(itemStageDeadlines.userId, userId)));
    if (deadlines.length) {
      await tx.insert(itemStageDeadlines).values(deadlines.map((d) => ({ ...d, itemId: id, userId })));
    }
    return true;
  });
}

/** Deadlines and notes go with it (ON DELETE CASCADE). */
export async function deleteContentItem(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.userId, userId)))
    .returning({ id: contentItems.id });
  return rows.length > 0;
}

export async function getContentItem(userId: string, id: string): Promise<ContentItemDetail | null> {
  const [row] = await db
    .select({ item: contentItems, account: accountColumns })
    .from(contentItems)
    .innerJoin(contentAccounts, eq(contentAccounts.id, contentItems.accountId))
    .where(and(eq(contentItems.id, id), eq(contentItems.userId, userId)));
  if (!row) return null;

  const deadlines = await db
    .select({ stage: itemStageDeadlines.stage, dueAt: itemStageDeadlines.dueAt })
    .from(itemStageDeadlines)
    .where(and(eq(itemStageDeadlines.itemId, id), eq(itemStageDeadlines.userId, userId)));
  return {
    ...row.item,
    account: row.account,
    // The DB check constraint guarantees only deadline stages are stored.
    deadlines: deadlines
      .map((d) => ({ stage: d.stage as DeadlineStage, dueAt: d.dueAt }))
      .sort((a, b) => deadlineStages.indexOf(a.stage) - deadlineStages.indexOf(b.stage)),
  };
}

/** Items with target time in [from, to), optionally for some accounts only. For the calendar. */
export async function listContentItems(
  userId: string,
  range: { from: Date; to: Date; accountIds?: string[] },
): Promise<CalendarItem[]> {
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      targetAt: contentItems.targetAt,
      account: { id: contentAccounts.id, name: contentAccounts.name, color: contentAccounts.color, timezone: contentAccounts.timezone },
    })
    .from(contentItems)
    .innerJoin(contentAccounts, eq(contentAccounts.id, contentItems.accountId))
    .where(
      and(
        eq(contentItems.userId, userId),
        gte(contentItems.targetAt, range.from),
        lt(contentItems.targetAt, range.to),
        range.accountIds?.length ? inArray(contentItems.accountId, range.accountIds) : undefined,
      ),
    )
    .orderBy(asc(contentItems.targetAt), asc(contentItems.createdAt));
  return rows;
}

// --- Notes (several per item) ---

async function ownsItem(userId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.id, itemId), eq(contentItems.userId, userId)));
  return Boolean(row);
}

export async function listNotes(userId: string, itemId: string): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.itemId, itemId), eq(notes.userId, userId)))
    .orderBy(asc(notes.createdAt));
}

/** Returns null when the item is not the user's. */
export async function createNote(userId: string, itemId: string, body: string): Promise<Note | null> {
  if (!(await ownsItem(userId, itemId))) return null;
  const [row] = await db.insert(notes).values({ userId, itemId, bodyMd: body }).returning();
  return row ?? null;
}

export async function updateNote(userId: string, id: string, body: string): Promise<boolean> {
  const rows = await db
    .update(notes)
    .set({ bodyMd: body })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}
