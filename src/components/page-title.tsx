import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The template's two-tone page title (D-043): a serif lead line above the sans page name, like "Careers at / Aetherfield".
// The page name alone is the <h1>, so headings and screen readers keep the real page name.
export function PageTitle({ lead, children, className }: { lead: ReactNode; children: ReactNode; className?: string }) {
  return (
    <hgroup className={cn("min-w-0 text-[2rem] leading-[1.05] tracking-tight lg:text-5xl", className)}>
      <p className="font-serif">{lead}</p>
      <h1 className="font-heading font-medium break-words">{children}</h1>
    </hgroup>
  );
}
