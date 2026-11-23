"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userSettingsSchema } from "@/lib/validation/user-settings";
import { requireUser } from "@/server/dal/session";
import { saveUserSettings } from "@/server/dal/user-settings";
import { refreshReminders } from "@/server/reminder-jobs";
import { checkLimit, limits } from "@/server/rate-limit";

type Field = "timezone" | "quietStart" | "quietEnd";
export type SettingsFormValues = { emailEnabled: boolean; quietEnabled: boolean; quietStart: string; quietEnd: string; timezone: string };
export type SettingsFormState = {
  saved?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<Field, string[]>>;
  // Echoed back so a failed save keeps what the user typed.
  values?: SettingsFormValues;
};

export async function saveUserSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const user = await requireUser();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values: SettingsFormValues = {
    emailEnabled: formData.get("emailEnabled") === "on",
    quietEnabled: formData.get("quietEnabled") === "on",
    quietStart: text("quietStart"),
    quietEnd: text("quietEnd"),
    timezone: text("timezone"),
  };
  const parsed = userSettingsSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited, values };

  try {
    await saveUserSettings(user.id, parsed.data);
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan. Coba lagi sebentar lagi.", values };
  }
  // Awaited, not after(): turning email off must cancel pending reminders before we say "Tersimpan".
  await refreshReminders(user.id);
  revalidatePath("/", "layout");
  return { saved: true };
}
