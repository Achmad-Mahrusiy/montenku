"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { indonesianTimezones } from "@/lib/validation/content-account";
import { deleteAccountAction, type DeleteAccountState } from "@/server/actions/auth";
import { saveUserSettingsAction, type SettingsFormState, type SettingsFormValues } from "@/server/actions/user-settings";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";

// A native checkbox drawn as the Figma toggle; the whole row is its label, so the tap target is the row.
export const switchClass =
  "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground outline-none transition-colors checked:bg-foreground focus-visible:ring-3 focus-visible:ring-ring/50 before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-card before:transition-transform checked:before:translate-x-5 motion-reduce:transition-none motion-reduce:before:transition-none";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.[0] ? (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  ) : null;
}

type Props = { initial: SettingsFormValues; email: string; otherTimezones: string[] };

export function SettingsForm({ initial, email, otherTimezones }: Props) {
  const [state, formAction, pending] = useActionState(saveUserSettingsAction, {} satisfies SettingsFormState);
  const values = state.values ?? initial;
  const errors = state.fieldErrors ?? {};

  return (
    // key: remount when the shown values change. React's reset after an action puts a <select> back to the option
    // it first rendered (it ignores later defaultValue changes), which would show the old timezone after saving.
    <form key={JSON.stringify(values)} action={formAction} noValidate className="grid gap-6">
      <section data-reveal aria-labelledby="email-title" className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="email-title" className="font-heading text-xl font-bold">
          Email pengingat
        </h2>
        <label htmlFor="emailEnabled" className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Kirim pengingat lewat email</span>
            <span className="block text-sm break-words text-muted-foreground">Ke {email}</span>
          </span>
          <input id="emailEnabled" name="emailEnabled" type="checkbox" role="switch" defaultChecked={values.emailEnabled} className={switchClass} />
        </label>
      </section>

      <section data-reveal aria-labelledby="quiet-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <label htmlFor="quietEnabled" className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span className="min-w-0">
            <span id="quiet-title" className="block font-heading text-xl font-bold">
              Jam senyap
            </span>
            <span className="block text-sm text-muted-foreground">Pengingat di jam ini ditunda sampai jam senyap selesai.</span>
          </span>
          <input id="quietEnabled" name="quietEnabled" type="checkbox" role="switch" defaultChecked={values.quietEnabled} className={switchClass} />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="quietStart">Mulai</Label>
            <Input id="quietStart" name="quietStart" type="time" defaultValue={values.quietStart} aria-invalid={errors.quietStart ? true : undefined} aria-describedby="quietStart-error" />
            <FieldError id="quietStart-error" errors={errors.quietStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quietEnd">Selesai</Label>
            <Input id="quietEnd" name="quietEnd" type="time" defaultValue={values.quietEnd} aria-invalid={errors.quietEnd ? true : undefined} aria-describedby="quietEnd-error" />
            <FieldError id="quietEnd-error" errors={errors.quietEnd} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">Zona waktu kamu</Label>
            <select id="timezone" name="timezone" defaultValue={values.timezone} aria-invalid={errors.timezone ? true : undefined} aria-describedby="timezone-hint timezone-error" className={selectClass}>
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
        </div>
        <p id="timezone-hint" className="text-sm text-muted-foreground">
          Zona ini juga menentukan &quot;hari ini&quot; di kalender. Jadwal tiap akun konten tetap memakai zona akunnya.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan pengaturan"}
        </Button>
        <p role="status" className="text-sm">
          {state.error ? <span className="text-destructive">{state.error}</span> : state.saved ? "Pengaturan tersimpan." : null}
        </p>
      </div>
    </form>
  );
}

// Hapus akun (D-034). Its own form, so "Simpan pengaturan" can never send it. Typing HAPUS plus the password is the
// confirmation, so there is no extra dialog (Figma has none either).
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, {} satisfies DeleteAccountState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate aria-labelledby="delete-title" className="grid gap-4 rounded-xl border border-destructive bg-card p-5 sm:p-6">
      <div>
        <h2 id="delete-title" className="font-heading text-xl font-bold">
          Hapus akun Montenku
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Semua akun konten, jadwal, catatan, dan pengingat ikut terhapus permanen. Pengingat yang belum terkirim dibatalkan. Ini tidak bisa dibatalkan.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="confirm">Ketik HAPUS untuk konfirmasi</Label>
        <Input id="confirm" name="confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={errors.confirm ? true : undefined} aria-describedby="confirm-error" />
        <FieldError id="confirm-error" errors={errors.confirm} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="delete-password">Kata sandi</Label>
        <Input id="delete-password" name="password" type="password" autoComplete="current-password" aria-invalid={errors.password ? true : undefined} aria-describedby="delete-password-error" />
        <FieldError id="delete-password-error" errors={errors.password} />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="w-full border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15 active:bg-destructive/20 sm:w-fit"
      >
        {pending ? "Menghapus..." : "Hapus akun dan semua data"}
      </Button>
    </form>
  );
}
