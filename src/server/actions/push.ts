"use server";

import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/validation/push";
import { deletePushSubscription, hasPushSubscription, savePushSubscription } from "@/server/dal/push-subscriptions";
import { requireUser } from "@/server/dal/session";
import { checkLimit, limits } from "@/server/rate-limit";
import { refreshReminders } from "@/server/reminder-jobs";

// The push switch in Pengaturan (D-037). Called from the browser with the PushSubscription it just made or holds.

export type PushActionResult = { ok: true } | { ok: false; error: string };

/** Turns push on for this device, then brings the user's reminders up to date (a push row per reminder appears). */
export async function subscribePushAction(subscription: unknown): Promise<PushActionResult> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) {
    // Only the host, never the full endpoint: the rest of the URL is the device's secret address.
    const endpoint = (subscription as { endpoint?: unknown } | null)?.endpoint;
    const host = typeof endpoint === "string" && URL.canParse(endpoint) ? new URL(endpoint).hostname : "tidak terbaca";
    console.error(`Langganan push ditolak (host: ${host})`);
    return { ok: false, error: "Browser ini belum didukung untuk notifikasi push." };
  }
  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { ok: false, error: limited };

  await savePushSubscription(user.id, parsed.data);
  // Awaited, like saving Pengaturan: "on" then means the reminders already know about this device.
  await refreshReminders(user.id);
  return { ok: true };
}

/** Turns push off for this device. Pending push reminders are cancelled when it was the last device. */
export async function unsubscribePushAction(endpoint: unknown): Promise<PushActionResult> {
  const user = await requireUser();
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "Perangkat ini tidak dikenali." };
  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { ok: false, error: limited };

  await deletePushSubscription(user.id, parsed.data);
  await refreshReminders(user.id);
  return { ok: true };
}

/** Whether this device's subscription belongs to the signed-in user (it may belong to another login on this browser). */
export async function pushStatusAction(endpoint: unknown): Promise<boolean> {
  const user = await requireUser();
  const parsed = pushEndpointSchema.safeParse(endpoint);
  return parsed.success ? hasPushSubscription(user.id, parsed.data) : false;
}
