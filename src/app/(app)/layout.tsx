import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/server/dal/session";
import { AppNav } from "./app-nav";
import { MobileMenu } from "./mobile-menu";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireUser();

  // One navbar on top for every screen size (Figma "Prototype v2: navbar atas"). Sticky, so the menu stays in reach
  // after scrolling, as the old bottom bar was.
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:h-[72px] lg:px-12">
          {/* Placeholder text wordmark until there is a real logo (docs/desain-ui.md). */}
          <Link href="/" className="rounded-md font-heading text-2xl font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Montenku
          </Link>
          <nav aria-label="Navigasi utama" className="hidden flex-1 lg:block">
            <AppNav variant="top" />
          </nav>
          <div className="hidden lg:block">
            <SignOutButton />
          </div>
          <MobileMenu signOut={<SignOutButton />} />
        </div>
      </header>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
