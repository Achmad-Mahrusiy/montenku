import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

// Devices that receive push reminders (D-036). Same rule as every DAL module: each query filters by userId.

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/**
 * Turns push on for this device. A device belongs to one login at a time: if another user subscribed on this browser
 * before, the row moves to the current user, so the previous login's reminders stop reaching it.
 */
export async function savePushSubscription(userId: string, input: PushSubscriptionInput): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ ...input, userId })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: input.p256dh, auth: input.auth } });
}

/** Turns push off for this device. False when the device is not the user's. */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

/** Whether this device gets the user's push reminders (the switch in Pengaturan). */
export async function hasPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  return Boolean(row);
}
