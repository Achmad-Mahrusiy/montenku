"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { toAuthErrorMessage } from "@/lib/auth-errors";
import { deleteAccountSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { pushEndpointSchema } from "@/lib/validation/push";
import { deletePushSubscription } from "@/server/dal/push-subscriptions";
import { getSession, requireUser } from "@/server/dal/session";
import { checkLimit, clientIp, emailKey, firstLimitError, limits } from "@/server/rate-limit";
import { refreshReminders } from "@/server/reminder-jobs";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
  // Echoed back so the form keeps what the user typed (React resets forms after an action). Never the password.
  values?: { name?: string; email?: string };
};

function typed(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return { name: text("name"), email: text("email") };
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: typed(formData) };

  const limited = await firstLimitError([
    [limits.signInByIp, await clientIp()],
    [limits.signInByEmail, emailKey(parsed.data.email)],
  ]);
  if (limited) return { error: limited, values: typed(formData) };

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    return { error: toAuthErrorMessage(error), values: typed(formData) };
  }
  // Outside try/catch: redirect() works by throwing, and the catch above would swallow it.
  redirect("/");
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: typed(formData) };

  const limited = await firstLimitError([[limits.signUpByIp, await clientIp()]]);
  if (limited) return { error: limited, values: typed(formData) };

  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    return { error: toAuthErrorMessage(error), values: typed(formData) };
  }
  redirect("/");
}

/**
 * Signs out. The form sends this device's push endpoint (when push is on here), so the device stops getting this
 * user's reminders on a shared browser (D-037). Without it, or with an expired session, signing out still works.
 */
export async function signOutAction(formData: FormData) {
  const session = await getSession();
  const endpoint = pushEndpointSchema.safeParse(formData.get("pushEndpoint"));
  if (session && endpoint.success && (await deletePushSubscription(session.user.id, endpoint.data))) {
    const userId = session.user.id;
    after(() => refreshReminders(userId));
  }
  await auth.api.signOut({ headers: await headers() });
  redirect("/masuk");
}

export type DeleteAccountState = { error?: string; fieldErrors?: Partial<Record<"confirm" | "password", string[]>> };

/**
 * Hapus akun (D-034). Better Auth checks the password, deletes the user (the database cascades to every table of
 * ours) and expires the session cookie. Reminders still in the queue then find no row and do nothing (D-006).
 */
export async function deleteAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await requireUser();
  const parsed = deleteAccountSchema.safeParse({ confirm: formData.get("confirm") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const limited = await checkLimit(limits.deleteAccountByUser, user.id);
  if (limited) return { error: limited };

  try {
    await auth.api.deleteUser({ body: { password: parsed.data.password }, headers: await headers() });
  } catch (error) {
    return { error: toAuthErrorMessage(error) };
  }
  redirect("/masuk?akun=dihapus");
}
