import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/dal/session";
import { AuthTabs } from "../auth-tabs";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Masuk | Montenku" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ akun?: string | string[] }> }) {
  // Checked here with the real session, not in proxy.ts: a stale cookie there would bounce between / and /masuk.
  if (await getSession()) redirect("/");
  // Set by deleteAccountAction (D-034). Only a fixed text is shown, never anything from the URL.
  const deleted = (await searchParams).akun === "dihapus";

  return (
    <>
      <AuthTabs active="/masuk" />
      {deleted ? (
        <p role="status" className="mb-6 rounded-[5px] bg-marker p-3 text-sm">
          Akunmu dan semua datanya sudah dihapus.
        </p>
      ) : null}
      <h1 className="font-heading text-[2rem] leading-tight font-medium tracking-tight">Masuk ke akunmu</h1>
      <p className="mt-1 mb-6 text-lg text-muted-foreground">Lanjutkan jadwal kontenmu.</p>
      <SignInForm />
    </>
  );
}
