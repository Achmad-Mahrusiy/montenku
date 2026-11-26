import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/server/dal/session";
import { AppNav } from "./app-nav";
import { MobileMenu } from "./mobile-menu";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireUser();

  // One navbar on top for every screen size (D-040), in the v3 template style (D-043): no bar of its own, links on
  // the right. Still sticky, so it gets a near-solid Paper background that keeps the links readable over the content.
  // No backdrop-blur: it would make the header the containing block of the phone menu's fixed panel and squash it.
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:h-[72px] lg:px-12">
          {/* Placeholder text wordmark until there is a real logo (docs/desain-ui.md). */}
          <Link href="/" className="rounded-md font-heading text-2xl font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Montenku
          </Link>
          <nav aria-label="Navigasi utama" className="hidden flex-1 justify-end lg:flex">
            <AppNav variant="top" />
          </nav>
          <div className="hidden lg:block">
            <SignOutButton variant="text" />
          </div>
          <MobileMenu signOut={<SignOutButton variant="button" />} />
        </div>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
