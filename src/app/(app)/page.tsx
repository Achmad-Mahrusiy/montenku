import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listContentAccounts } from "@/server/dal/content-accounts";
import { requireUser } from "@/server/dal/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const activeCount = (await listContentAccounts(user.id)).filter((account) => !account.archivedAt).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <h1 className="font-heading text-3xl font-bold break-words">Halo, {user.name}</h1>
      {activeCount === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tambahkan akun TikTok, Instagram, atau YouTube yang kamu kelola. Jadwal dan pengingat nanti menempel ke akun ini.
          </p>
          <Button asChild className="mt-4">
            <Link href="/akun-konten?tambah=1">Tambah akun konten</Link>
          </Button>
        </section>
      ) : (
        <p className="mt-2 text-muted-foreground">
          Kamu mengelola {activeCount} akun konten aktif.{" "}
          <Link href="/akun-konten" className="font-semibold text-foreground underline underline-offset-4">
            Lihat akun konten
          </Link>
        </p>
      )}
    </main>
  );
}
