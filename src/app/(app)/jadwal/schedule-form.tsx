"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { weekdays } from "@/lib/validation/schedule";
import { saveScheduleAction, type ScheduleFormField, type ScheduleFormState } from "@/server/actions/schedules";
import type { AccountOption } from "../konten/item-form";

export type ScheduleFormValues = {
  accountId: string;
  title: string;
  days: string[];
  time: string;
  startDate: string;
  endDate: string;
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.[0] ? (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  ) : null;
}

type Props = { scheduleId?: string; initial: ScheduleFormValues; accounts: AccountOption[] };

export function ScheduleForm({ scheduleId, initial, accounts }: Props) {
  const [state, formAction, pending] = useActionState(saveScheduleAction, {} satisfies ScheduleFormState);
  const values = { ...initial, ...state.values };
  const errors = state.fieldErrors ?? {};
  const invalid = (field: ScheduleFormField) => (errors[field] ? true : undefined);
  // Display only (the timezone note). Inputs stay uncontrolled so React's reset after a save keeps the saved values.
  const [accountId, setAccountId] = useState(values.accountId);
  const account = accounts.find((a) => a.id === accountId);

  return (
    <form action={formAction} noValidate className="grid gap-5">
      {scheduleId ? <input type="hidden" name="id" value={scheduleId} /> : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-background p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
          Jadwal tersimpan.
        </p>
      ) : null}

      <div className="grid gap-5 @lg:grid-cols-2">
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
          <Label htmlFor="title">Nama jadwal</Label>
          <Input id="title" name="title" defaultValue={values.title} placeholder="Upload resep" aria-invalid={invalid("title")} aria-describedby="title-error" />
          <FieldError id="title-error" errors={errors.title} />
        </div>
      </div>

      <fieldset aria-describedby="days-error">
        <legend className="mb-2 text-sm font-semibold">Ulangi setiap</legend>
        <div className="flex flex-wrap gap-2">
          {weekdays.map((d) => (
            <label key={d.code} className="relative">
              <input type="checkbox" name="days" value={d.code} defaultChecked={values.days.includes(d.code)} className="peer sr-only" />
              <span className="sr-only">{d.long}</span>
              {/* Picked days get the turmeric marker, as in the Figma editor. */}
              <span
                aria-hidden="true"
                className="flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-lg border bg-card px-3 text-sm font-semibold peer-checked:border-marker peer-checked:bg-marker peer-checked:text-marker-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:bg-muted"
              >
                {d.short}
              </span>
            </label>
          ))}
        </div>
        <FieldError id="days-error" errors={errors.days} />
      </fieldset>

      <div className="grid gap-5 @lg:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="time">Jam</Label>
          <Input id="time" name="time" type="time" defaultValue={values.time} aria-invalid={invalid("time")} aria-describedby="time-error" />
          <FieldError id="time-error" errors={errors.time} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="startDate">Mulai</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={values.startDate} aria-invalid={invalid("startDate")} aria-describedby="startDate-error" />
          <FieldError id="startDate-error" errors={errors.startDate} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="endDate">Berakhir</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={values.endDate} aria-invalid={invalid("endDate")} aria-describedby="endDate-hint endDate-error" />
          <p id="endDate-hint" className="text-sm text-muted-foreground">
            Kosongkan kalau tidak berakhir.
          </p>
          <FieldError id="endDate-error" errors={errors.endDate} />
        </div>
      </div>

      {account ? (
        <p className="rounded-lg bg-muted p-3 text-sm">
          <span className="font-semibold">
            Zona waktu: {account.timezoneLabel}, mengikuti akun {account.name}.
          </span>{" "}
          <span className="text-muted-foreground">Kalau zona waktu akun diganti, jadwal ini tetap di jam yang sama di zona yang baru.</span>
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : scheduleId ? "Simpan jadwal" : "Buat jadwal"}
        </Button>
      </div>
    </form>
  );
}
