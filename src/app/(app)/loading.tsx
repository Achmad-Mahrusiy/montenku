export default function Loading() {
  // Grey blocks in the shape of a page while the next one loads; the text is for screen readers.
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <p role="status" className="sr-only">
        Memuat...
      </p>
      <div aria-hidden="true" className="grid gap-6 motion-safe:animate-pulse">
        <div className="h-9 w-64 max-w-full rounded-lg bg-muted" />
        <div className="h-40 rounded-xl bg-muted" />
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="h-32 rounded-xl bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
        </div>
      </div>
    </main>
  );
}
