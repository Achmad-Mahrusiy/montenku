"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createNoteAction, deleteNoteAction, updateNoteAction, type NoteFormState } from "@/server/actions/notes";

export type NoteView = { id: string; body: string; updatedLabel: string };

const textareaClass =
  "min-h-32 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

/** Textarea with a Tulis / Pratinjau switch, as in the Figma "Catatan" card. Controlled so the preview is live. */
function NoteEditor({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-1" role="group" aria-label="Mode catatan">
          {(["Tulis", "Pratinjau"] as const).map((mode) => {
            const active = (mode === "Pratinjau") === preview;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => setPreview(mode === "Pratinjau")}
                className={cn(
                  "h-11 rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
      {/* The textarea stays in the form while previewing (hidden), so its value is still submitted. */}
      <textarea
        id={id}
        name="body"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"## Hook 3 detik pertama\n1. Tunjukkan hasil jadi dulu"}
        aria-describedby={`${id}-hint`}
        hidden={preview}
        className={textareaClass}
      />
      {preview ? (
        <div className="min-h-32 rounded-lg bg-muted p-3">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada isi untuk dipratinjau.</p>}
        </div>
      ) : null}
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        Markdown: ## judul, **tebal**, 1. daftar bernomor, - daftar biasa.
      </p>
    </div>
  );
}

function SubmitButton({ children, pendingText }: { children: string; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

function ErrorText({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

function NoteCard({ itemId, note }: { itemId: string; note: NoteView }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [body, setBody] = useState(note.body);
  const [state, formAction] = useActionState(async (prev: NoteFormState, formData: FormData) => {
    const result = await updateNoteAction(prev, formData);
    if (result.saved) setMode("view");
    return result;
  }, {});

  if (mode === "edit") {
    return (
      <li className="rounded-lg border p-3">
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="id" value={note.id} />
          <NoteEditor id={`note-${note.id}`} label="Ubah catatan" value={body} onChange={setBody} />
          <ErrorText error={state.error} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Menyimpan...">Simpan catatan</SubmitButton>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBody(note.body);
                setMode("view");
              }}
            >
              Batal
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg bg-muted p-3">
      <Markdown>{note.body}</Markdown>
      <p className="mt-2 text-xs text-muted-foreground">{note.updatedLabel}</p>
      {mode === "confirm" ? (
        // Inline confirmation: a note is small, so no modal; it still takes a second, deliberate click.
        <form action={deleteNoteAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="id" value={note.id} />
          <p className="w-full text-sm font-semibold">Hapus catatan ini? Tidak bisa dibatalkan.</p>
          <Button type="button" variant="outline" onClick={() => setMode("view")}>
            Batal
          </Button>
          <ConfirmDelete />
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" onClick={() => setMode("edit")}>
            Ubah
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setMode("confirm")}>
            Hapus
          </Button>
        </div>
      )}
    </li>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-destructive text-white hover:bg-destructive/85">
      {pending ? "Menghapus..." : "Ya, hapus"}
    </Button>
  );
}

function NewNote({ itemId }: { itemId: string }) {
  const [body, setBody] = useState("");
  const [state, formAction] = useActionState(async (prev: NoteFormState, formData: FormData) => {
    const result = await createNoteAction(prev, formData);
    if (result.saved) setBody("");
    return result;
  }, {});

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <NoteEditor id="new-note" label="Catatan baru" value={body} onChange={setBody} />
      <ErrorText error={state.error} />
      <div>
        <SubmitButton pendingText="Menyimpan...">Tambah catatan</SubmitButton>
      </div>
    </form>
  );
}

export function NotesPanel({ itemId, notes }: { itemId: string; notes: NoteView[] }) {
  return (
    <section data-reveal aria-labelledby="notes-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="notes-title" className="font-heading text-xl font-bold">
        Catatan
      </h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada catatan. Tulis ide hook, naskah kasar, atau daftar bahan di sini.</p>
      ) : (
        <ul className="grid gap-3">
          {notes.map((note) => (
            <NoteCard key={note.id} itemId={itemId} note={note} />
          ))}
        </ul>
      )}
      <NewNote itemId={itemId} />
    </section>
  );
}
