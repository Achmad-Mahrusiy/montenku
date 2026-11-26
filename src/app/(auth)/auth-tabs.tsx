import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/masuk", label: "Masuk" },
  { href: "/daftar", label: "Daftar" },
] as const;

// The active tab gets the Silk marker on a light track, in mono like the template buttons (Figma v3).
export function AuthTabs({ active }: { active: (typeof tabs)[number]["href"] }) {
  return (
    <nav aria-label="Masuk atau daftar" className="mb-7 grid grid-cols-2 gap-1 rounded-[5px] bg-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center justify-center rounded-[5px] font-mono text-[13px] outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.href === active
              ? "bg-marker text-marker-foreground"
              : "text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
