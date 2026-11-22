import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/dal/session";
import { AuthTabs } from "../auth-tabs";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Masuk | Montenku" };

export default async function SignInPage() {
  // Checked here with the real session, not in proxy.ts: a stale cookie there would bounce between / and /masuk.
  if (await getSession()) redirect("/");

  return (
    <>
      <AuthTabs active="/masuk" />
      <h1 className="font-heading text-2xl font-bold">Masuk ke akunmu</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Lanjutkan jadwal kontenmu.</p>
      <SignInForm />
    </>
  );
}
