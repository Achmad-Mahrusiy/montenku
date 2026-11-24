import webpush, { WebPushError } from "web-push";
import { env } from "@/lib/env";
import type { PushMessage, PushTarget } from "@/server/dal/reminders";

// Sends one Web Push message to one device (D-036). web-push does the VAPID signing and the payload encryption the
// protocol requires; hand-writing that crypto is not worth the risk.

const vapid =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
    : null;

/** "gone" when the push service says the device no longer exists (404/410), so the caller deletes it. */
export async function sendPush(target: PushTarget, message: PushMessage, options: { ttlSeconds: number; topic: string }): Promise<"ok" | "gone"> {
  if (!vapid) {
    // Fails on purpose so the reminder shows as failed, like a missing RESEND_API_KEY.
    throw new Error("VAPID belum diisi, push tidak dikirim");
  }
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(message), {
      vapidDetails: vapid,
      TTL: options.ttlSeconds,
      topic: options.topic,
      urgency: "high",
      timeout: 10_000,
    });
    return "ok";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return "gone";
    // Never include the endpoint in the error: it is a capability for that device.
    if (error instanceof WebPushError) throw new Error(`Push ${error.statusCode} ${error.body.slice(0, 200)}`);
    throw error;
  }
}
