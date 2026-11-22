import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/dal/session";
import { AuthTabs } from "../auth-tabs";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Daftar | Montenku" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/");

  return (
    <>
      <AuthTabs active="/daftar" />
      <h1 className="font-heading text-2xl font-bold">Buat akun Montenku</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Satu tempat untuk jadwal semua akun kontenmu.</p>
      <SignUpForm />
    </>
  );
}
