"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { contentAccountIdSchema, contentAccountSchema } from "@/lib/validation/content-account";
import {
  archiveContentAccount,
  createContentAccount,
  restoreContentAccount,
  updateContentAccount,
} from "@/server/dal/content-accounts";
import { requireUser } from "@/server/dal/session";
import { refreshReminders } from "@/server/reminder-jobs";
import { checkLimit, limits } from "@/server/rate-limit";

const fields = ["name", "platform", "handle", "color", "timezone"] as const;
type Field = (typeof fields)[number];

export type ContentAccountFormState = {
  error?: string;
  fieldErrors?: Partial<Record<Field, string[]>>;
  // Echoed back so the form keeps what the user typed after a failed save.
  values?: Partial<Record<Field, string>>;
};

function typed(formData: FormData) {
  const values: Partial<Record<Field, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

// The sidebar in the app layout lists accounts too, so refresh the layout, not just this page.
// Called outside try/catch: redirect() works by throwing.
function done(): never {
  revalidatePath("/", "layout");
  redirect("/akun-konten");
}

export async function saveContentAccountAction(
  _prev: ContentAccountFormState,
  formData: FormData,
): Promise<ContentAccountFormState> {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const parsed = contentAccountSchema.safeParse(typed(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: typed(formData) };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited, values: typed(formData) };

  const rawId = formData.get("id");
  try {
    if (rawId) {
      const id = contentAccountIdSchema.safeParse(rawId);
      // Not found and "belongs to someone else" look the same on purpose.
      if (!id.success || !(await updateContentAccount(user.id, id.data, parsed.data))) {
        return { error: "Akun konten tidak ditemukan.", values: typed(formData) };
      }
    } else {
      await createContentAccount(user.id, parsed.data);
    }
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan. Coba lagi sebentar lagi.", values: typed(formData) };
  }
  done();
}

// Archive and restore are reversible, so they need no confirmation step. An unknown id just does nothing.
export async function archiveContentAccountAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const id = contentAccountIdSchema.safeParse(formData.get("id"));
  if (id.success) await archiveContentAccount(user.id, id.data);
  done();
}

export async function restoreContentAccountAction(formData: FormData) {
  const user = await requireUser();
  after(() => refreshReminders(user.id));
  const id = contentAccountIdSchema.safeParse(formData.get("id"));
  if (id.success) await restoreContentAccount(user.id, id.data);
  done();
}
