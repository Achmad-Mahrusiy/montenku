import Link from "next/link";

// The template's closing block (D-043): a charcoal band with a row of links and the giant Pale Gold wordmark.
// The wordmark is decoration only; its size follows the window width and it is clipped, so phones never scroll sideways.
export function SiteFooter({ links }: { links: readonly { href: string; label: string }[] }) {
  return (
    <footer className="overflow-hidden bg-foreground text-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-12">
        <nav aria-label="Tautan bawah">
          <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex h-11 items-center text-[15px] font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-gold/60">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="font-mono text-[13px]">© {new Date().getFullYear()} Montenku</p>
      </div>
      <p aria-hidden="true" className="mx-auto -mb-[0.2em] max-w-7xl px-2 font-sans text-[23vw] leading-none font-medium tracking-tighter text-gold select-none xl:text-[300px]">
        Montenku
      </p>
    </footer>
  );
}
