"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Only pages that exist today. Pengaturan joins when it is built. `short`: label in the phone bottom bar.
// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
const items = [
  { href: "/", label: "Dashboard", short: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", short: "Kalender", also: ["/konten"] },
  { href: "/jadwal", label: "Jadwal berulang", short: "Jadwal", also: [] },
  { href: "/akun-konten", label: "Akun konten", short: "Akun", also: [] },
] as const;

const isActive = (pathname: string, item: (typeof items)[number]) =>
  item.href === "/"
    ? pathname === "/"
    : [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function AppNav({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "sidebar" ? "grid gap-1" : "grid grid-cols-4 gap-1"}>
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
              {variant === "bottom" ? item.short : item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
