import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { reconcile } from "@/server/dal/reminders";
import { reminderDeps } from "@/server/reminder-jobs";

// Called by the daily Cron Job and the 15-minute Schedule (vercel.json), both with "Authorization: Bearer <CRON_SECRET>".
// Runs the same idempotent reconcile() for everyone (D-005, D-009); running twice at once is safe.

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  // Constant-time compare, so the secret cannot be guessed from response timing.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await reconcile(reminderDeps, { now: new Date() });
    return Response.json(result);
  } catch (error) {
    // Logged for us; the body stays generic on a public URL.
    console.error("reconcile gagal:", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
