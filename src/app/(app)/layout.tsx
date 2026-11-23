import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";
import { listContentAccounts } from "@/server/dal/content-accounts";
import { requireUser } from "@/server/dal/session";
import { AppNav } from "./app-nav";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  const activeAccounts = (await listContentAccounts(user.id)).filter((account) => !account.archivedAt);

  const signOut = (
    <form action={signOutAction}>
      <Button type="submit" variant="outline">
        Keluar
      </Button>
    </form>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r bg-card px-6 py-8 lg:flex lg:flex-col">
        {/* Placeholder text wordmark until there is a real logo (docs/desain-ui.md). */}
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="block font-heading text-3xl font-bold tracking-tight">Montenku</span>
          <span className="block text-sm text-muted-foreground">Monitor kontenku</span>
        </Link>
        <nav aria-label="Navigasi utama" className="mt-8">
          <AppNav variant="sidebar" />
        </nav>
        {activeAccounts.length > 0 ? (
          <section aria-labelledby="sidebar-accounts" className="mt-8">
            <h2 id="sidebar-accounts" className="text-sm text-muted-foreground">
              Akun konten
            </h2>
            <ul className="mt-2 grid gap-2 text-sm">
              {activeAccounts.map((account) => (
                <li key={account.id} className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: account.color }} />
                  <span className="truncate">{account.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="mt-auto pt-8">{signOut}</div>
      </aside>

      <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 lg:hidden">
        <Link href="/" className="rounded-md font-heading text-xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Montenku
        </Link>
        {signOut}
      </header>

      {/* pb-24 leaves room for the fixed bottom nav on phones. */}
      <div className="min-w-0 pb-24 lg:pb-0">{children}</div>

      <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 border-t bg-card px-2 py-2 lg:hidden">
        <AppNav variant="bottom" />
      </nav>
    </div>
  );
}
