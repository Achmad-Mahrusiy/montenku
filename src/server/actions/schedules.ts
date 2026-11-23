"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { occurrenceKeySchema, scheduleIdSchema, scheduleSchema, wallTimeSchema } from "@/lib/validation/schedule";
import {
  clearException,
  createSchedule,
  deleteSchedule,
  fillSlot,
  setException,
  updateSchedule,
} from "@/server/dal/schedules";
import { requireUser } from "@/server/dal/session";
import { refreshReminders } from "@/server/reminder-jobs";
import { checkLimit, limits } from "@/server/rate-limit";

const fields = ["accountId", "title", "time", "startDate", "endDate"] as const;
export type ScheduleFormField = (typeof fields)[number] | "days";

export type ScheduleFormState = {
  error?: string;
  fieldErrors?: Partial<Record<ScheduleFormField, string[]>>;
  // Echoed back so the form keeps what the user typed after a failed save.
  values?: Partial<Record<(typeof fields)[number], string>> & { days?: string[] };
  saved?: boolean;
};

function readForm(formData: FormData) {
  const values: NonNullable<ScheduleFormState["values"]> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  values.days = formData.getAll("days").filter((d): d is string => typeof d === "string");
  return values;
}

export async function saveScheduleAction(_prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const values = readForm(formData);
  const parsed = scheduleSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited, values };

  const rawId = formData.get("id");
  let createdId: string | null = null;
  try {
    if (rawId) {
      const id = scheduleIdSchema.safeParse(rawId);
      // Not found, someone else's, or moving onto an archived account: one message on purpose.
      if (!id.success || !(await updateSchedule(user.id, id.data, parsed.data))) {
        return { error: "Jadwal tidak ditemukan, atau akun konten yang dipilih tidak bisa dipakai.", values };
      }
      revalidatePath("/jadwal");
      return { saved: true };
    }
    createdId = await createSchedule(user.id, parsed.data);
    if (!createdId) return { error: "Akun konten tidak ditemukan atau sudah diarsipkan.", values };
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan. Coba lagi sebentar lagi.", values };
  }
  // Outside try/catch: redirect() works by throwing.
  redirect(`/jadwal?ubah=${createdId}`);
}

export async function deleteScheduleAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const id = scheduleIdSchema.safeParse(formData.get("id"));
  if (id.success) await deleteSchedule(user.id, id.data);
  revalidatePath("/", "layout");
  redirect("/jadwal");
}

// The occurrence buttons post scheduleId + key. A bad or foreign id/key simply changes nothing (the DAL checks both).
const slot = z.object({ scheduleId: scheduleIdSchema, key: occurrenceKeySchema });
const readSlot = (formData: FormData) => slot.safeParse({ scheduleId: formData.get("scheduleId"), key: formData.get("key") });

export async function skipOccurrenceAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const s = readSlot(formData);
  if (s.success) await setException(user.id, s.data.scheduleId, s.data.key, { kind: "skip" });
  revalidatePath("/jadwal");
}

export async function moveOccurrenceAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const s = readSlot(formData);
  const to = wallTimeSchema.safeParse(formData.get("movedTo"));
  if (s.success && to.success) await setException(user.id, s.data.scheduleId, s.data.key, { kind: "move", movedToLocal: to.data });
  revalidatePath("/jadwal");
}

export async function restoreOccurrenceAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const s = readSlot(formData);
  if (s.success) await clearException(user.id, s.data.scheduleId, s.data.key);
  revalidatePath("/jadwal");
}

/** "Isi konten": creates (or finds) the item for this slot and opens it. */
export async function fillSlotAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const s = readSlot(formData);
  if (!s.success) return;
  // Creates an item, so it shares the write quota; when over it, the button just does nothing this minute.
  if (await checkLimit(limits.writeByUser, user.id)) return;
  const itemId = await fillSlot(user.id, s.data.scheduleId, s.data.key);
  if (itemId) redirect(`/konten/${itemId}`);
  revalidatePath("/jadwal");
}
