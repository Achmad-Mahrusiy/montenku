"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { contentStatuses, deadlineStages, statusLabels, type ContentStatus } from "@/lib/validation/content-item";
import { saveContentItemAction, type ContentItemFormState, type ItemFormField } from "@/server/actions/content-items";

export type AccountOption = { id: string; name: string; color: string; timezoneLabel: string; archived: boolean };
export type ItemFormValues = Record<ItemFormField, string>;
export type SavedDeadlines = { now: number; dueAt: Partial<Record<ItemFormField, number>> };

type Props = {
  // Missing = create a new item.
  itemId?: string;
  initial: ItemFormValues;
  accounts: AccountOption[];
  // Saved deadlines as epoch ms plus the server's "now", so "Terlambat" / "Sisa 40 menit" render the same on server and client.
  deadlines: SavedDeadlines;
  heading: ReactNode;
  // Rendered next to the save button (delete, on the detail page). Must not be a form inside this form.
  extraAction?: ReactNode;
  // Right column on desktop, below the form on phones (the notes panel). Outside the <form>, so it can hold its own forms.
  aside?: ReactNode;
};

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.[0] ? (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  ) : null;
}

function dueLabel(dueAt: number | undefined, done: boolean, now: number): { text: string; urgent: boolean } | null {
  if (done) return { text: "Selesai", urgent: false };
  if (dueAt === undefined) return null;
  const minutes = Math.round((dueAt - now) / 60_000);
  if (minutes < 0) return { text: "Terlambat", urgent: true };
  if (minutes < 60) return { text: `Sisa ${minutes} menit`, urgent: true };
  if (minutes < 24 * 60) return { text: `Sisa ${Math.floor(minutes / 60)} jam`, urgent: true };
  return null;
}

export function ItemForm({ itemId, initial, accounts, deadlines, heading, extraAction, aside }: Props) {
  const [state, formAction, pending] = useActionState(saveContentItemAction, {} satisfies ContentItemFormState);
  const values = { ...initial, ...state.values };
  const errors = state.fieldErrors ?? {};
  const invalid = (field: ItemFormField) => (errors[field] ? true : undefined);

  // Display-only state, so the progress bar, "Selesai" labels and timezone hint follow the form live.
  // The inputs themselves stay uncontrolled (defaultValue/defaultChecked): after a successful save React resets the
  // form to those defaults, which by then hold the saved values. A controlled radio would keep its old DOM value.
  const [status, setStatus] = useState<ContentStatus>(contentStatuses.find((s) => s === values.status) ?? "idea");
  const [accountId, setAccountId] = useState(values.accountId);
  const account = accounts.find((a) => a.id === accountId);
  const step = contentStatuses.indexOf(status) + 1;

  const saveButton = (
    // form="item-form": the button sits outside the form element (next to the title, as in Figma).
    <Button type="submit" form="item-form" disabled={pending} className="flex-1 lg:flex-none">
      {pending ? "Menyimpan..." : itemId ? "Simpan perubahan" : "Simpan konten"}
    </Button>
  );

  return (
    <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">{heading}</div>
      <div className="hidden gap-3 lg:flex">
        {extraAction}
        {saveButton}
      </div>
    </div>
    {/* Side column only from xl: at lg (1024px) the sidebar leaves too little room for two columns. */}
    <div className={cn("mt-6 grid gap-6 xl:items-start", aside && "xl:grid-cols-[minmax(0,1fr)_400px]")}>
    <form id="item-form" action={formAction} noValidate className="grid min-w-0 gap-6">
      {itemId ? <input type="hidden" name="id" value={itemId} /> : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-lg border bg-card p-3 text-sm">
          Perubahan tersimpan.
        </p>
      ) : null}

      <section aria-labelledby="info-title" className="@container grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="info-title" className="font-heading text-xl font-bold">
          Info konten
        </h2>

        <div className="grid gap-2">
          <Label htmlFor="title">Judul</Label>
          <Input id="title" name="title" defaultValue={values.title} aria-invalid={invalid("title")} aria-describedby="title-error" />
          <FieldError id="title-error" errors={errors.title} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Deskripsi singkat</Label>
          <textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={values.description}
            aria-invalid={invalid("description")}
            aria-describedby="description-error"
            className={textareaClass}
          />
          <FieldError id="description-error" errors={errors.description} />
        </div>

        {/* Container query: three columns only when the card itself is wide enough, wherever it sits. */}
        <div className="grid gap-5 @lg:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor="accountId">Akun konten</Label>
            <select
              id="accountId"
              name="accountId"
              defaultValue={values.accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-invalid={invalid("accountId")}
              aria-describedby="accountId-error"
              className={selectClass}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? " (diarsipkan)" : ""}
                </option>
              ))}
            </select>
            <FieldError id="accountId-error" errors={errors.accountId} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="targetDate">Tanggal target</Label>
            <Input
              id="targetDate"
              name="targetDate"
              type="date"
              defaultValue={values.targetDate}
              aria-invalid={invalid("targetDate")}
              aria-describedby="targetDate-error"
            />
            <FieldError id="targetDate-error" errors={errors.targetDate} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="targetTime">Jam target</Label>
            <Input
              id="targetTime"
              name="targetTime"
              type="time"
              defaultValue={values.targetTime}
              aria-invalid={invalid("targetTime")}
              aria-describedby="targetTime-hint targetTime-error"
            />
            {account ? (
              <p id="targetTime-hint" className="text-sm text-muted-foreground">
                {account.timezoneLabel}, zona waktu akun {account.name}
              </p>
            ) : null}
            <FieldError id="targetTime-error" errors={errors.targetTime} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="tags">Tag</Label>
          <Input id="tags" name="tags" defaultValue={values.tags} aria-invalid={invalid("tags")} aria-describedby="tags-hint tags-error" />
          <p id="tags-hint" className="text-sm text-muted-foreground">
            Pisahkan dengan koma
          </p>
          <FieldError id="tags-error" errors={errors.tags} />
        </div>
      </section>

      <section aria-labelledby="status-title" className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <h2 id="status-title" className="font-heading text-xl font-bold">
            Status produksi
          </h2>
          <div aria-hidden="true" className="mt-3 flex gap-1">
            {contentStatuses.map((s, i) => (
              <span key={s} className={cn("h-1.5 w-6 rounded-full", i < step ? "bg-foreground" : "bg-border")} />
            ))}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabels[status]} ({step}/{contentStatuses.length})
          </p>
        </div>

        <fieldset aria-describedby="status-error">
          <legend className="sr-only">Pilih status</legend>
          <div className="flex flex-wrap gap-2">
            {contentStatuses.map((s) => (
              <label key={s} className="relative">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  defaultChecked={values.status === s}
                  onChange={() => setStatus(s)}
                  className="peer sr-only"
                />
                {/* The active stage gets the turmeric marker, like the Figma "Editing" chip. */}
                <span className="flex h-11 cursor-pointer items-center rounded-lg border bg-card px-3 text-sm font-semibold peer-checked:border-marker peer-checked:bg-marker peer-checked:text-marker-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:bg-muted">
                  {statusLabels[s]}
                </span>
              </label>
            ))}
          </div>
          <FieldError id="status-error" errors={errors.status} />
        </fieldset>

        <div>
          <h3 className="font-semibold">Tenggat per tahap (opsional)</h3>
          <ul className="mt-2 divide-y border-t">
            {deadlineStages.map((stage) => {
              const field = `deadline_${stage}` as const;
              const done = contentStatuses.indexOf(status) > contentStatuses.indexOf(stage);
              const label = dueLabel(deadlines.dueAt[field], done, deadlines.now);
              return (
                <li key={stage} className="grid gap-2 py-3 sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-4">
                  <Label htmlFor={field}>{statusLabels[stage]}</Label>
                  <Input
                    id={field}
                    name={field}
                    type="datetime-local"
                    defaultValue={values[field]}
                    aria-invalid={invalid(field)}
                    aria-describedby={`${field}-state ${field}-error`}
                  />
                  <span id={`${field}-state`} className={cn("text-sm", label?.urgent ? "text-destructive" : "text-muted-foreground")}>
                    {label?.text}
                  </span>
                  <FieldError id={`${field}-error`} errors={errors[field]} />
                </li>
              );
            })}
          </ul>
        </div>
      </section>

    </form>
    {aside}
    </div>
    {/* Phones: the same actions at the end of the form, as in the Figma mobile action bar. */}
    <div className="mt-6 flex gap-3 lg:hidden">
      {extraAction}
      {saveButton}
    </div>
    </>
  );
}
