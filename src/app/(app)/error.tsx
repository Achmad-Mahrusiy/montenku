"use client";

import { Button } from "@/components/ui/button";

// Shown when a page in the app fails to load, e.g. the database connection drops.
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6">
        <h1 className="font-heading text-xl font-bold">Halaman gagal dimuat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Biasanya karena koneksi ke database terputus sebentar.</p>
        <Button type="button" className="mt-4" onClick={() => retry()}>
          Muat ulang
        </Button>
      </div>
    </main>
  );
}
