import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentItemIdSchema } from "@/lib/validation/content-item";
import { getContentItem, listNotes, type Note } from "@/server/dal/content-items";
import { requireUser } from "@/server/dal/session";
import { accountOptions, savedDeadlines, valuesFromItem } from "../form-data";
import { ItemForm } from "../item-form";
import { DeleteItemButton } from "./delete-item-button";
import { NotesPanel, type NoteView } from "./notes-panel";

export const metadata: Metadata = { title: "Detail konten | Montenku" };

// Note times in the item's account timezone, like every other time on this page (D-022).
function toNoteView(note: Note, timeZone: string): NoteView {
  const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone }).format(note.updatedAt);
  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 1000;
  return { id: note.id, body: note.bodyMd, updatedLabel: `${edited ? "Diubah" : "Ditulis"} ${when}` };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = contentItemIdSchema.safeParse((await params).id);
  // Not found and "belongs to someone else" both 404, so ids cannot be probed.
  const item = id.success ? await getContentItem(user.id, id.data) : null;
  if (!item) notFound();
  const notes = await listNotes(user.id, item.id);

  const heading = (
    <>
      <nav aria-label="Lokasi halaman" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/kalender" className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          Kalender
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: item.account.color }} />
        {item.account.name}
      </nav>
      <h1 className="mt-1 font-heading text-3xl font-bold break-words">{item.title}</h1>
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <ItemForm
        itemId={item.id}
        heading={heading}
        initial={valuesFromItem(item)}
        accounts={await accountOptions(user.id, item.accountId)}
        deadlines={savedDeadlines(item)}
        extraAction={<DeleteItemButton itemId={item.id} title={item.title} />}
        aside={<NotesPanel itemId={item.id} notes={notes.map((n) => toNoteView(n, item.account.timezone))} />}
      />
    </main>
  );
}
