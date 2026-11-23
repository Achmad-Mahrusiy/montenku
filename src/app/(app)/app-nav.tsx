"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Only pages that exist today. Jadwal berulang and Pengaturan join when they are built.
// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
const items = [
  { href: "/", label: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", also: ["/konten"] },
  { href: "/akun-konten", label: "Akun konten", also: [] },
] as const;

const isActive = (pathname: string, item: (typeof items)[number]) =>
  item.href === "/"
    ? pathname === "/"
    : [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function AppNav({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "sidebar" ? "grid gap-1" : "grid grid-cols-3 gap-2"}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center rounded-lg px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                variant === "bottom" && "justify-center",
                // The turmeric "stabilo" marks where you are, as in the Figma navigation.
                active ? "bg-marker text-marker-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
