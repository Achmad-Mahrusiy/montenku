"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
const items = [
  { href: "/", label: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", also: ["/konten"] },
  { href: "/jadwal", label: "Jadwal berulang", also: [] },
  { href: "/akun-konten", label: "Akun konten", also: [] },
  { href: "/pengaturan", label: "Pengaturan", also: [] },
] as const;

const isActive = (pathname: string, item: (typeof items)[number]) =>
  item.href === "/"
    ? pathname === "/"
    : [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

// "top": one row in the navbar on wide screens. "menu": a stacked list in the phone menu.
export function AppNav({ variant }: { variant: "top" | "menu" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "top" ? "flex items-center gap-1" : "grid gap-1"}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
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
