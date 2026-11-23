"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { contentItemIdSchema, contentItemSchema, deadlineStages } from "@/lib/validation/content-item";
import { createContentItem, deleteContentItem, updateContentItem } from "@/server/dal/content-items";
import { requireUser } from "@/server/dal/session";
import { checkLimit, limits } from "@/server/rate-limit";

const formFields = [
  "title",
  "description",
  "accountId",
  "targetDate",
  "targetTime",
  "status",
  "tags",
  "deadline_script",
  "deadline_production",
  "deadline_editing",
  "deadline_ready",
] as const;
export type ItemFormField = (typeof formFields)[number];

export type ContentItemFormState = {
  error?: string;
  fieldErrors?: Partial<Record<ItemFormField, string[]>>;
  // Echoed back so the form keeps what the user typed after a failed save.
  values?: Partial<Record<ItemFormField, string>>;
  saved?: boolean;
};

function readForm(formData: FormData) {
  const values: Partial<Record<ItemFormField, string>> = {};
  for (const field of formFields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

// Zod reports deadline errors at ["deadlines", "script"]; the form field is "deadline_script".
function fieldErrorsOf(error: z.ZodError): ContentItemFormState["fieldErrors"] {
  const errors: Partial<Record<ItemFormField, string[]>> = {};
  for (const issue of error.issues) {
    const [first, second] = issue.path;
    const field = (first === "deadlines" ? `deadline_${String(second)}` : String(first)) as ItemFormField;
    (errors[field] ??= []).push(issue.message);
  }
  return errors;
}

export async function saveContentItemAction(_prev: ContentItemFormState, formData: FormData): Promise<ContentItemFormState> {
  const user = await requireUser();
  const values = readForm(formData);
  const parsed = contentItemSchema.safeParse({
    ...values,
    deadlines: Object.fromEntries(deadlineStages.map((stage) => [stage, values[`deadline_${stage}`]])),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited, values };

  const rawId = formData.get("id");
  let createdId: string | null = null;
  try {
    if (rawId) {
      const id = contentItemIdSchema.safeParse(rawId);
      // Not found, someone else's, or moving onto an archived account: one message on purpose.
      if (!id.success || !(await updateContentItem(user.id, id.data, parsed.data))) {
        return { error: "Konten tidak ditemukan, atau akun konten yang dipilih tidak bisa dipakai.", values };
      }
      revalidatePath(`/konten/${id.data}`);
      return { saved: true };
    }
    const created = await createContentItem(user.id, parsed.data);
    if (!created) return { error: "Akun konten tidak ditemukan atau sudah diarsipkan.", values };
    createdId = created.id;
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan. Coba lagi sebentar lagi.", values };
  }
  // Outside try/catch: redirect() works by throwing.
  redirect(`/konten/${createdId}`);
}

export async function deleteContentItemAction(formData: FormData) {
  const user = await requireUser();
  const id = contentItemIdSchema.safeParse(formData.get("id"));
  if (id.success) await deleteContentItem(user.id, id.data);
  redirect("/");
}
