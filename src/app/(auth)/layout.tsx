import Link from "next/link";
import type { ReactNode } from "react";
import { StoryPanel } from "./story-panel";

// Masuk/Daftar in the v3 style (D-043): the form card on the right and the Silk story panel on the left; on phones the
// form comes first and the panel follows under it.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 sm:px-6 lg:px-12">
      <header className="flex h-16 items-center justify-between lg:h-[72px]">
        {/* Placeholder text wordmark until there is a real logo (docs/desain-ui.md). */}
        <Link href="/" className="rounded-md font-heading text-2xl font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Montenku
        </Link>
        <Link href="/" className="inline-flex h-11 items-center rounded-md font-mono text-[13px] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          <span aria-hidden="true">←&nbsp;</span>Beranda
        </Link>
      </header>
      <main className="grid gap-6 pt-2 pb-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-12 lg:pt-6">
        <div className="rounded-xl border border-foreground bg-card p-6 sm:p-8 lg:order-last">{children}</div>
        <StoryPanel />
      </main>
    </div>
  );
}
