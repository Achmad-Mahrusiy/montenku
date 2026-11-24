import { daysBetween, todayIn } from "@/lib/time";
import { isStageDone, type ContentStatus, type DeadlineStage } from "@/lib/validation/content-item";

// Pure rules for the dashboard (D-033): what is late, what is coming up, which reminder to show.

type Account = { id: string; name: string; color: string; timezone: string };
export type DeadlineRow = { itemId: string; title: string; status: ContentStatus; account: Account; stage: DeadlineStage; dueAt: Date };
export type LatePostRow = { itemId: string; title: string; status: ContentStatus; account: Account; targetAt: Date };
/** One line in "Terlambat" or "Tenggat mendekat". `what` is a stage, or "posted" for the posting time itself. */
export type TodoRow = { itemId: string; title: string; account: Account; dueAt: Date; what: DeadlineStage | "posted" };

export const UPCOMING_MS = 7 * 24 * 60 * 60 * 1000;

/** Keeps one row per item: the earliest. A missed "naskah" usually explains the later misses, so it is the one to show. */
function earliestPerItem(rows: TodoRow[]): TodoRow[] {
  const byItem = new Map<string, TodoRow>();
  for (const row of rows) {
    const seen = byItem.get(row.itemId);
    if (!seen || row.dueAt < seen.dueAt) byItem.set(row.itemId, row);
  }
  return [...byItem.values()].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/**
 * late: open stage deadlines and unposted posting times before `now`.
 * upcoming: open stage deadlines in the next 7 days, for items that are not already late.
 */
export function todoLists(deadlines: DeadlineRow[], latePosts: LatePostRow[], now: Date): { late: TodoRow[]; upcoming: TodoRow[] } {
  const open = deadlines
    .filter((d) => !isStageDone(d.status, d.stage))
    .map((d): TodoRow => ({ itemId: d.itemId, title: d.title, account: d.account, dueAt: d.dueAt, what: d.stage }));
  const late = earliestPerItem([
    ...open.filter((d) => d.dueAt < now),
    ...latePosts
      .filter((p) => p.status !== "posted" && p.targetAt < now)
      .map((p): TodoRow => ({ itemId: p.itemId, title: p.title, account: p.account, dueAt: p.targetAt, what: "posted" })),
  ]);
  const lateIds = new Set(late.map((r) => r.itemId));
  const upcoming = earliestPerItem(open.filter((d) => d.dueAt >= now && d.dueAt.getTime() < now.getTime() + UPCOMING_MS && !lateIds.has(d.itemId)));
  return { late, upcoming };
}

/** "lewat 2 hari" by calendar days in `timeZone`; within the same day "lewat 3 jam" or "lewat 20 menit". */
export function lateLabel(dueAt: Date, now: Date, timeZone: string): string {
  const days = daysBetween(todayIn(timeZone, dueAt), todayIn(timeZone, now));
  if (days >= 1) return `lewat ${days} hari`;
  const minutes = Math.floor((now.getTime() - dueAt.getTime()) / 60_000);
  return minutes >= 60 ? `lewat ${Math.floor(minutes / 60)} jam` : `lewat ${Math.max(1, minutes)} menit`;
}

type ReminderLike = { status: "pending" | "sending" | "sent" | "cancelled" | "failed"; sendAt: Date };
/** The one reminder worth showing on a posting: a failed one, else the next one due, else the last one sent. */
export function pickReminder<T extends ReminderLike>(rows: T[]): T | null {
  const by = (...statuses: ReminderLike["status"][]) => rows.filter((r) => statuses.includes(r.status));
  return (
    by("failed")[0] ??
    by("pending", "sending").sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())[0] ??
    by("sent").sort((a, b) => b.sendAt.getTime() - a.sendAt.getTime())[0] ??
    null
  );
}
