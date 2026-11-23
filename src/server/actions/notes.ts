"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contentItemIdSchema, noteSchema } from "@/lib/validation/content-item";
import { createNote, deleteNote, updateNote } from "@/server/dal/content-items";
import { requireUser } from "@/server/dal/session";
import { checkLimit, limits } from "@/server/rate-limit";

export type NoteFormState = { error?: string; saved?: boolean };

// itemId only decides which page to refresh. Ownership is checked by the DAL with the session's user id.
const target = z.object({ itemId: contentItemIdSchema });
const withId = target.extend({ id: z.uuid() });

function readBody(formData: FormData) {
  return noteSchema.safeParse({ body: formData.get("body") });
}

export async function createNoteAction(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const user = await requireUser();
  const ids = target.safeParse({ itemId: formData.get("itemId") });
  const body = readBody(formData);
  if (!ids.success) return { error: "Konten tidak ditemukan." };
  if (!body.success) return { error: body.error.issues[0]?.message };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited };

  try {
    if (!(await createNote(user.id, ids.data.itemId, body.data.body))) return { error: "Konten tidak ditemukan." };
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan catatan. Coba lagi sebentar lagi." };
  }
  revalidatePath(`/konten/${ids.data.itemId}`);
  return { saved: true };
}

export async function updateNoteAction(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const user = await requireUser();
  const ids = withId.safeParse({ itemId: formData.get("itemId"), id: formData.get("id") });
  const body = readBody(formData);
  if (!ids.success) return { error: "Catatan tidak ditemukan." };
  if (!body.success) return { error: body.error.issues[0]?.message };

  const limited = await checkLimit(limits.writeByUser, user.id);
  if (limited) return { error: limited };

  try {
    if (!(await updateNote(user.id, ids.data.id, body.data.body))) return { error: "Catatan tidak ditemukan." };
  } catch (error) {
    console.error(error instanceof Error && error.cause ? error.cause : error);
    return { error: "Gagal menyimpan catatan. Coba lagi sebentar lagi." };
  }
  revalidatePath(`/konten/${ids.data.itemId}`);
  return { saved: true };
}

export async function deleteNoteAction(formData: FormData) {
  const user = await requireUser();
  const ids = withId.safeParse({ itemId: formData.get("itemId"), id: formData.get("id") });
  if (!ids.success) return;
  await deleteNote(user.id, ids.data.id);
  revalidatePath(`/konten/${ids.data.itemId}`);
}
