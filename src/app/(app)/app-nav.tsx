"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
const appNavItems = [
  { href: "/", label: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", also: ["/konten"] },
  { href: "/jadwal", label: "Jadwal berulang", also: [] },
  { href: "/akun-konten", label: "Akun konten", also: [] },
  { href: "/pengaturan", label: "Pengaturan", also: [] },
] as const;

const isActive = (pathname: string, item: (typeof appNavItems)[number]) =>
  item.href === "/"
    ? pathname === "/"
    : [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

// "top": plain text links in the navbar on wide screens, the current page underlined (template style, D-043).
// "menu": the phone side panel's stacked links with a hairline between them.
export function AppNav({ variant }: { variant: "top" | "menu" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "top" ? "flex items-center gap-1" : "grid"}>
      {appNavItems.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center font-medium whitespace-nowrap underline-offset-[6px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                variant === "top" ? "h-11 rounded-md px-3 text-[15px] hover:underline" : "h-12 border-b text-lg",
                active && "underline decoration-2",
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
