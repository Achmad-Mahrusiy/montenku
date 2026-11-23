"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// `short`: label in the phone bottom bar.
// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
const items = [
  { href: "/", label: "Dashboard", short: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", short: "Kalender", also: ["/konten"] },
  { href: "/jadwal", label: "Jadwal berulang", short: "Jadwal", also: [] },
  { href: "/akun-konten", label: "Akun konten", short: "Akun", also: [] },
  { href: "/pengaturan", label: "Pengaturan", short: "Pengaturan", also: [] },
] as const;

const isActive = (pathname: string, item: (typeof items)[number]) =>
  item.href === "/"
    ? pathname === "/"
    : [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function AppNav({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();

  return (
    // Bottom bar: columns sized to their labels at 13px (as in Figma), so all five fit at 360px and up;
    // narrower phones scroll the bar sideways instead of cutting "Pengaturan" off.
    <ul className={variant === "sidebar" ? "grid gap-1" : "grid grid-flow-col justify-between gap-0.5 overflow-x-auto"}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center rounded-lg px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                variant === "bottom" && "justify-center px-1.5 text-[13px] whitespace-nowrap",
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
