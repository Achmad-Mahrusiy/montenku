"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-destructive text-white hover:bg-destructive/85 active:bg-destructive/75">
      {pending ? "Menghapus..." : "Ya, hapus"}
    </Button>
  );
}

type Props = {
  /** Sent as the hidden "id" field. */
  id: string;
  label: string;
  question: string;
  /** What will be lost, shown in the dialog. */
  children: ReactNode;
  action: (formData: FormData) => Promise<void>;
};

// Permanent deletes ask first. Native <dialog>: Escape closes it and focus stays inside while it is open.
export function ConfirmDeleteButton({ id, label, question, children, action }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => dialog.current?.showModal()}
        className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/5 lg:flex-none"
      >
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`delete-${id}-title`}
        className="m-auto w-[min(100%-2rem,28rem)] rounded-xl border bg-card p-6 text-foreground backdrop:bg-foreground/40"
      >
        <h2 id={`delete-${id}-title`} className="font-heading text-xl font-bold">
          {question}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
        <form action={action} className="mt-6 flex flex-wrap justify-end gap-3">
          <input type="hidden" name="id" value={id} />
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            Batal
          </Button>
          <ConfirmButton />
        </form>
      </dialog>
    </>
  );
}
