"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { reminderOffsetSchema } from "@/lib/validation/reminder";
import { addReminderSetting, removeReminderSetting, retryFailedReminder, type ReminderTarget } from "@/server/dal/reminder-settings";
import { requireUser } from "@/server/dal/session";
import { refreshReminders } from "@/server/reminder-jobs";
import { checkLimit, limits } from "@/server/rate-limit";

// The reminder panel posts small forms. A bad or foreign id simply changes nothing: the DAL checks ownership.

const targetSchema = z.union([z.object({ itemId: z.uuid() }), z.object({ scheduleId: z.uuid() })]);

function readTarget(formData: FormData): ReminderTarget | null {
  const itemId = formData.get("itemId");
  const scheduleId = formData.get("scheduleId");
  const parsed = targetSchema.safeParse(itemId ? { itemId } : { scheduleId });
  return parsed.success ? parsed.data : null;
}

// Item pages and the schedules page both show reminders; refresh whichever is open.
const refreshPages = () => revalidatePath("/", "layout");

export async function addReminderAction(formData: FormData) {
  const user = await requireUser();
  const target = readTarget(formData);
  const offset = reminderOffsetSchema.safeParse(formData.get("offset"));
  if (!target || !offset.success) return;
  if (await checkLimit(limits.writeByUser, user.id)) return;
  if (await addReminderSetting(user.id, target, offset.data)) after(() => refreshReminders(user.id));
  refreshPages();
}

export async function removeReminderAction(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success && (await removeReminderSetting(user.id, id.data))) after(() => refreshReminders(user.id));
  refreshPages();
}

/** "Kirim ulang": awaited (not after()), so the page shows the new status right away. */
export async function retryReminderAction(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  if (await checkLimit(limits.writeByUser, user.id)) return;
  if (await retryFailedReminder(user.id, id.data)) await refreshReminders(user.id);
  refreshPages();
}
