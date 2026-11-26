// The closing charcoal band (D-043). It only names the maker; navigation lives in the top navbar (D-044).
export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-12">
        <p className="font-mono text-[13px]">© {new Date().getFullYear()} Montenku · Troii</p>
      </div>
    </footer>
  );
}
