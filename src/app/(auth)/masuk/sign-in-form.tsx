"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signInAction, type AuthFormState } from "@/server/actions/auth";
import { Field } from "../field";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, {} satisfies AuthFormState);

  return (
    // noValidate: show our Indonesian messages instead of the browser's own popups.
    <form action={formAction} noValidate className="grid gap-5">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
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
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Memeriksa..." : "Masuk"}
      </Button>
    </form>
  );
}
