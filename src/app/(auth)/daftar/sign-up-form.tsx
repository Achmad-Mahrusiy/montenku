"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signUpAction, type AuthFormState } from "@/server/actions/auth";
import { Field } from "../field";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, {} satisfies AuthFormState);

  return (
    // noValidate: show our Indonesian messages instead of the browser's own popups.
    <form action={formAction} noValidate className="grid gap-5">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Field
        name="name"
        label="Nama"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Kata sandi"
        type="password"
        autoComplete="new-password"
        required
        hint="Minimal 8 karakter."
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Membuat akun..." : "Buat akun"}
      </Button>
    </form>
  );
}
