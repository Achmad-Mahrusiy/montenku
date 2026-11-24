import { env } from "@/lib/env";
import { scheduleSlots } from "@/lib/calendar";
import { buildIcs, feedEvents } from "@/lib/ics";
import { feedFileSchema } from "@/lib/validation/content-account";
import { getAccountByFeedToken } from "@/server/dal/content-accounts";
import { listContentItems, listDeadlines } from "@/server/dal/content-items";
import { listFilledSlots, listSchedules } from "@/server/dal/schedules";

const DAY_MS = 24 * 60 * 60 * 1000;
// Same answer for a malformed, unknown, rotated or turned-off link, so a wrong guess learns nothing.
const notFound = () => new Response("Tidak ditemukan", { status: 404 });

/**
 * .ics feed of one content account (D-035). No session: the secret token in the URL is the only key. Calendar apps
 * fetch this on their own schedule. The token is never logged.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = feedFileSchema.safeParse((await params).file);
  if (!file.success) return notFound();

  try {
    const account = await getAccountByFeedToken(file.data.slice(0, -".ics".length));
    if (!account) return notFound();
    const userId = account.userId;
    const accountIds = [account.id];

    // shortcut: only 90 days back and 365 days ahead; widen if users want older history in their calendar app.
    const now = new Date();
    const from = new Date(now.getTime() - 90 * DAY_MS);
    const to = new Date(now.getTime() + 365 * DAY_MS);
    const [items, schedules, deadlines] = await Promise.all([
      listContentItems(userId, { from, to, accountIds }),
      listSchedules(userId, accountIds),
      listDeadlines(userId, { from, to, accountIds }),
    ]);
    const filled = await listFilledSlots(userId, schedules.map((s) => s.id));
    const events = feedEvents({ baseUrl: env.BETTER_AUTH_URL, items, slots: scheduleSlots(schedules, filled, from, to), deadlines });

    return new Response(buildIcs(`Montenku · ${account.name}`, events, now), {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    // Drizzle errors carry query params (here: the token), so log only the underlying cause.
    console.error(error instanceof Error && error.cause ? error.cause : "Feed .ics gagal dibuat");
    return new Response("Coba lagi sebentar lagi", { status: 503 });
  }
}
