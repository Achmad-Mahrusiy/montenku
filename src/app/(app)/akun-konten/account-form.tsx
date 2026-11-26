"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accountColors,
  colorLabels,
  indonesianTimezones,
  platformLabels,
  type ContentAccountInput,
} from "@/lib/validation/content-account";
import {
  archiveContentAccountAction,
  restoreContentAccountAction,
  saveContentAccountAction,
  type ContentAccountFormState,
} from "@/server/actions/content-accounts";

const selectClass =
  "h-11 w-full rounded-[5px] border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.[0] ? (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  ) : null;
}

// Plain strings: these only pre-fill the form. The server validates whatever comes back.
export type AccountFormValues = Record<keyof ContentAccountInput, string>;

type Props = {
  // Missing = create a new account.
  account?: { id: string; archived: boolean } & AccountFormValues;
  defaults: AccountFormValues;
  // Passed from the server: the browser's own timezone list can differ from the one the server validates against.
  otherTimezones: string[];
};

export function AccountForm({ account, defaults, otherTimezones }: Props) {
  const [state, formAction, pending] = useActionState(saveContentAccountAction, {} satisfies ContentAccountFormState);
  const values = { ...defaults, ...account, ...state.values };
  const errors = state.fieldErrors ?? {};
  const invalid = (field: keyof typeof errors) => (errors[field] ? true : undefined);

  return (
    <form action={formAction} noValidate className="grid gap-5">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-background p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="name">Nama akun</Label>
        <Input id="name" name="name" defaultValue={values.name} aria-invalid={invalid("name")} aria-describedby="name-error" />
        <FieldError id="name-error" errors={errors.name} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="platform">Platform</Label>
        <select id="platform" name="platform" defaultValue={values.platform} aria-invalid={invalid("platform")} aria-describedby="platform-error" className={selectClass}>
          {Object.entries(platformLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldError id="platform-error" errors={errors.platform} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          name="handle"
          placeholder="@namaakun"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={values.handle ? `@${values.handle.replace(/^@/, "")}` : ""}
          aria-invalid={invalid("handle")}
          aria-describedby="handle-error"
        />
        <FieldError id="handle-error" errors={errors.handle} />
      </div>

      <fieldset className="grid gap-2" aria-describedby="color-error">
        <legend className="mb-2 text-sm font-semibold">Warna di kalender</legend>
        {/* gap-1.5 keeps all six 44px swatches on one row at 375px. */}
        <div className="flex flex-wrap gap-1.5">
          {accountColors.map((color) => (
            <label key={color} className="relative">
              <input type="radio" name="color" value={color} defaultChecked={values.color === color} className="peer sr-only" />
              <span className="sr-only">{colorLabels[color]}</span>
              {/* 44px tap target; the ring shows which color is picked and where keyboard focus is. */}
              <span
                aria-hidden="true"
                className="block size-11 rounded-full border-2 border-transparent ring-offset-2 ring-offset-card peer-checked:border-card peer-checked:ring-3 peer-checked:ring-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                style={{ background: color }}
              />
            </label>
          ))}
        </div>
        <FieldError id="color-error" errors={errors.color} />
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="timezone">Zona waktu</Label>
        <select id="timezone" name="timezone" defaultValue={values.timezone} aria-invalid={invalid("timezone")} aria-describedby="timezone-error" className={selectClass}>
          <optgroup label="Indonesia">
            {Object.entries(indonesianTimezones).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Lainnya">
            {otherTimezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </optgroup>
        </select>
        <FieldError id="timezone-error" errors={errors.timezone} />
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : account ? "Simpan akun" : "Tambah akun"}
        </Button>
        {account ? (
          // formAction: this button sends the same form (with the hidden id) to a different action.
          <Button type="submit" variant="outline" disabled={pending} formAction={account.archived ? restoreContentAccountAction : archiveContentAccountAction}>
            {account.archived ? "Pulihkan" : "Arsipkan"}
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href="/akun-konten">Batal</Link>
        </Button>
      </div>
    </form>
  );
}
