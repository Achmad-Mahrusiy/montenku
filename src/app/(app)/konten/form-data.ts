import { instantToWallTime, timezoneShortName } from "@/lib/time";
import { listContentAccounts } from "@/server/dal/content-accounts";
import type { ContentItemDetail } from "@/server/dal/content-items";
import type { AccountOption, ItemFormValues, SavedDeadlines } from "./item-form";

// Server-side helpers that turn database rows into what the item form shows.

/** Active accounts, plus the item's own account when it is archived (so editing it still works). */
export async function accountOptions(userId: string, keepAccountId?: string): Promise<AccountOption[]> {
  const now = new Date();
  return (await listContentAccounts(userId))
    .filter((a) => !a.archivedAt || a.id === keepAccountId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      timezoneLabel: timezoneShortName(a.timezone, now),
      archived: a.archivedAt !== null,
    }));
}

export function emptyValues(accountId: string): ItemFormValues {
  return {
    title: "",
    description: "",
    accountId,
    targetDate: "",
    targetTime: "",
    status: "idea",
    tags: "",
    deadline_script: "",
    deadline_production: "",
    deadline_editing: "",
    deadline_ready: "",
  };
}

/** Stored instants shown back as wall-clock time in the item's account timezone. */
export function valuesFromItem(item: ContentItemDetail): ItemFormValues {
  const tz = item.account.timezone;
  const [targetDate = "", targetTime = ""] = instantToWallTime(item.targetAt, tz).split("T");
  const values = { ...emptyValues(item.accountId), title: item.title, description: item.description, status: item.status };
  for (const d of item.deadlines) values[`deadline_${d.stage}`] = instantToWallTime(d.dueAt, tz);
  return { ...values, targetDate, targetTime, tags: item.tags.join(", ") };
}

export function savedDeadlines(item?: ContentItemDetail): SavedDeadlines {
  return {
    now: Date.now(),
    dueAt: Object.fromEntries((item?.deadlines ?? []).map((d) => [`deadline_${d.stage}`, d.dueAt.getTime()])),
  };
}
