"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppNav } from "./app-nav";

// Phone and narrow-window navigation: the ☰ button in the top bar slides a narrow panel in from the right (Figma "Mobile / Menu terbuka").
export function MobileMenu({ signOut }: { signOut: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Picking a page closes the menu; Next.js keeps this component mounted across pages.
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        onClick={() => setOpen(!open)}
        className="-mr-2 flex size-11 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-6 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d={open ? "M18 6 6 18M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      {/* top-16: right under the 64px top bar. Tapping the dimmed page beside the panel closes it. */}
      <div hidden={!open} aria-hidden="true" onClick={() => setOpen(false)} className="motion-page fixed inset-x-0 top-16 bottom-0 z-40 bg-foreground/30" />
      <div id="mobile-menu" data-lenis-prevent hidden={!open} onClick={closeOnLink} className="motion-slide fixed top-16 right-0 bottom-0 z-40 w-72 max-w-[85vw] overflow-y-auto border-l bg-card px-4 pb-6">
        <nav aria-label="Navigasi utama">
          <AppNav variant="menu" />
        </nav>
        <div className="mt-6">{signOut}</div>
      </div>
    </div>
  );
}
