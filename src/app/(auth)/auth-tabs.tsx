import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/masuk", label: "Masuk" },
  { href: "/daftar", label: "Daftar" },
] as const;

// The active tab gets the turmeric "stabilo" marker, the same signal used for the active nav item in the app.
export function AuthTabs({ active }: { active: (typeof tabs)[number]["href"] }) {
  return (
    <nav aria-label="Masuk atau daftar" className="mb-6 grid grid-cols-2 gap-1 rounded-lg border bg-card p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center justify-center rounded-md text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.href === active
              ? "bg-marker text-marker-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
