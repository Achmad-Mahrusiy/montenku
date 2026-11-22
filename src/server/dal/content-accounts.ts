import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { contentAccounts } from "@/db/schema";
import type { ContentAccountInput } from "@/lib/validation/content-account";

// Every function takes the owner's userId (from requireUser()) and filters by it in the query itself,
// so another user's account id simply matches nothing. See DECISIONS.md D-008.

export type ContentAccount = typeof contentAccounts.$inferSelect;

const ownedBy = (userId: string, id: string) => and(eq(contentAccounts.id, id), eq(contentAccounts.userId, userId));

// cache: the app layout (sidebar) and the page both need this list in the same request; query once.
export const listContentAccounts = cache(async (userId: string): Promise<ContentAccount[]> =>
  db
    .select()
    .from(contentAccounts)
    .where(eq(contentAccounts.userId, userId))
    // Active accounts first, then archived; oldest first inside each group.
    .orderBy(sql`${contentAccounts.archivedAt} is not null`, asc(contentAccounts.createdAt)),
);

export async function getContentAccount(userId: string, id: string): Promise<ContentAccount | null> {
  const [row] = await db.select().from(contentAccounts).where(ownedBy(userId, id));
  return row ?? null;
}

export async function createContentAccount(userId: string, input: ContentAccountInput): Promise<ContentAccount> {
  const [row] = await db
    .insert(contentAccounts)
    .values({ ...input, userId })
    .returning();
  if (!row) throw new Error("Insert content_accounts tidak mengembalikan baris");
  return row;
}

// Returns false when the account does not exist or belongs to someone else.
export async function updateContentAccount(userId: string, id: string, input: ContentAccountInput): Promise<boolean> {
  const rows = await db
    .update(contentAccounts)
    .set(input)
    .where(ownedBy(userId, id))
    .returning({ id: contentAccounts.id });
  return rows.length > 0;
}

export async function archiveContentAccount(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(contentAccounts)
    .set({ archivedAt: new Date() })
    .where(and(ownedBy(userId, id), isNull(contentAccounts.archivedAt)))
    .returning({ id: contentAccounts.id });
  return rows.length > 0;
}

export async function restoreContentAccount(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(contentAccounts)
    .set({ archivedAt: null })
    .where(and(ownedBy(userId, id), isNotNull(contentAccounts.archivedAt)))
    .returning({ id: contentAccounts.id });
  return rows.length > 0;
}
