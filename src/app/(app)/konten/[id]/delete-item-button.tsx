"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { deleteContentItemAction } from "@/server/actions/content-items";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-destructive text-white hover:bg-destructive/85 active:bg-destructive/75">
      {pending ? "Menghapus..." : "Ya, hapus"}
    </Button>
  );
}

// Deleting is permanent (notes and deadlines go too), so it asks first. Native <dialog>: Escape closes it
// and focus stays inside while it is open.
export function DeleteItemButton({ itemId, title }: { itemId: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => dialog.current?.showModal()}
        className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/5 lg:flex-none"
      >
        Hapus konten
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`delete-${itemId}-title`}
        className="m-auto w-[min(100%-2rem,28rem)] rounded-xl border bg-card p-6 text-foreground backdrop:bg-foreground/40"
      >
        <h2 id={`delete-${itemId}-title`} className="font-heading text-xl font-bold">
          Hapus konten ini?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground break-words">{title}</span> beserta catatan dan tenggatnya akan
          terhapus permanen. Ini tidak bisa dibatalkan.
        </p>
        <form action={deleteContentItemAction} className="mt-6 flex flex-wrap justify-end gap-3">
          <input type="hidden" name="id" value={itemId} />
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            Batal
          </Button>
          <ConfirmButton />
        </form>
      </dialog>
    </>
  );
}
