import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/dal/session";
import { accountOptions, emptyValues, savedDeadlines } from "../form-data";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "Buat konten baru | Montenku" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ akun?: string | string[] }> }) {
  const user = await requireUser();
  const accounts = await accountOptions(user.id);
  // From a calendar filtered to one account (?akun=<id>): start with that account picked, if it is one of yours.
  const { akun } = await searchParams;
  const preset = accounts.find((a) => a.id === akun) ?? accounts[0];
  const heading = <h1 className="font-heading text-3xl font-bold">Buat konten baru</h1>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      {!preset ? (
        <>
          {heading}
          <section className="mt-6 rounded-xl border border-dashed bg-card p-6">
            <h2 className="font-heading text-lg font-bold">Belum ada akun konten aktif</h2>
            <p className="mt-1 text-sm text-muted-foreground">Setiap konten milik satu akun. Tambahkan akun kontennya dulu.</p>
            <Button asChild className="mt-4">
              <Link href="/akun-konten?tambah=1">Tambah akun konten</Link>
            </Button>
          </section>
        </>
      ) : (
        <ItemForm heading={heading} initial={emptyValues(preset.id)} accounts={accounts} deadlines={savedDeadlines()} />
      )}
    </main>
  );
}
