import { send } from "@vercel/queue";
import { z } from "zod";
import { env } from "@/lib/env";
import { deliver, reconcile, type ReminderDeps } from "@/server/dal/reminders";
import { sendEmail } from "@/server/mailer";
import { sendPush } from "@/server/push";

// Wires the reminder engine to the real world. Everything queue-specific lives here (DECISIONS.md D-010).

export const REMINDER_TOPIC = "reminders";
// Vercel retries a failed delivery; after this many it stops. The row itself is failed after 5 email attempts (D-007).
export const MAX_DELIVERIES = 6;

// shortcut: the queue only runs on Vercel (it needs Vercel's OIDC credentials, and there is no local emulator).
// On a laptop sending is skipped and the cron/sweeper route delivers reminders when they are due; revisit in Fase 7.
const queueAvailable = Boolean(process.env.VERCEL);

export const reminderDeps: ReminderDeps = {
  appUrl: env.BETTER_AUTH_URL,
  mailer: { send: sendEmail },
  push: { send: sendPush },
  queue: {
    send: async (message, options) => {
      if (!queueAvailable) return;
      await send(REMINDER_TOPIC, message, options);
    },
  },
};

const messageSchema = z.object({ id: z.uuid(), sendAt: z.iso.datetime() });

/** Queue consumer body. A malformed message is acknowledged and dropped; a failed send throws so the queue retries. */
export async function handleReminderMessage(message: unknown): Promise<void> {
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) {
    console.error("Pesan pengingat tidak valid, dibuang:", parsed.error.issues);
    return;
  }
  await deliver(reminderDeps, parsed.data, new Date());
}

/** Backoff for the queue: 10s, 20s, 40s ... up to 5 minutes; give up after MAX_DELIVERIES. */
export function retryDelay(deliveryCount: number): { afterSeconds: number } | { acknowledge: true } {
  if (deliveryCount >= MAX_DELIVERIES) return { acknowledge: true };
  return { afterSeconds: Math.min(300, 2 ** deliveryCount * 5) };
}

/**
 * After a user changes an item, schedule, account or reminder: bring that user's reminders up to date now,
 * instead of waiting for the next cron run (D-005). Never fails the user's action; the cron catches up.
 */
export async function refreshReminders(userId: string): Promise<void> {
  try {
    await reconcile(reminderDeps, { now: new Date(), userId });
  } catch (error) {
    console.error("Gagal memperbarui pengingat (akan diulang oleh cron):", error);
  }
}
