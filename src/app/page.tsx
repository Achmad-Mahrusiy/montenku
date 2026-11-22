import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/dal/session";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 sm:px-6">
        <p className="font-heading text-xl font-bold">Montenku</p>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            Keluar
          </Button>
        </form>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-bold break-words">Halo, {user.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Kamu masuk sebagai <span className="font-semibold text-foreground break-all">{user.email}</span>.
        </p>
        {/* Temporary empty state: the content accounts list replaces this in Langkah 4. */}
        <section className="mt-8 rounded-lg border border-dashed bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Belum ada akun konten</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fitur menambah akun konten sedang dibuat.</p>
        </section>
      </main>
    </>
  );
}
