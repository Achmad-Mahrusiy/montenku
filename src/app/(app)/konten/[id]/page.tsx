import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentItemIdSchema } from "@/lib/validation/content-item";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteContentItemAction } from "@/server/actions/content-items";
import { getContentItem, listNotes, type Note } from "@/server/dal/content-items";
import { listReminderSettings, listReminderStatuses } from "@/server/dal/reminder-settings";
import { requireUser } from "@/server/dal/session";
import { getUserSettings } from "@/server/dal/user-settings";
import { accountOptions, savedDeadlines, valuesFromItem } from "../form-data";
import { ItemForm } from "../item-form";
import { ReminderPanel } from "../../reminder-panel";
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
  const target = { itemId: item.id };
  const [notes, reminderSettings, reminderStatuses, userSettings] = await Promise.all([
    listNotes(user.id, item.id),
    listReminderSettings(user.id, target),
    listReminderStatuses(user.id, target),
    getUserSettings(user.id),
  ]);
  const deadlines = savedDeadlines(item);

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
        deadlines={deadlines}
        extraAction={
          <ConfirmDeleteButton id={item.id} label="Hapus konten" question="Hapus konten ini?" action={deleteContentItemAction}>
            <span className="font-semibold text-foreground break-words">{item.title}</span> beserta catatan dan tenggatnya
            akan terhapus permanen. Ini tidak bisa dibatalkan.
          </ConfirmDeleteButton>
        }
        aside={
          // Order from Figma: reminders above notes.
          <div className="grid gap-6">
            <ReminderPanel
              target={target}
              settings={reminderSettings}
              statuses={reminderStatuses}
              timeZone={item.account.timezone}
              targetAt={item.targetAt}
              now={new Date(deadlines.now)}
              userSettings={userSettings}
            />
            <NotesPanel itemId={item.id} notes={notes.map((n) => toNoteView(n, item.account.timezone))} />
          </div>
        }
      />
    </main>
  );
}
