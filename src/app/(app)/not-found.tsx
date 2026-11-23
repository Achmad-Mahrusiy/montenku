import Link from "next/link";
import { Button } from "@/components/ui/button";

// Shown inside the app (with navigation) when a page calls notFound(), e.g. an item id that is not yours.
export default function AppNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="font-heading text-3xl font-bold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-muted-foreground">Mungkin kontennya sudah dihapus, atau tautannya salah.</p>
      <Button asChild className="mt-6">
        <Link href="/">Kembali ke dashboard</Link>
      </Button>
    </main>
  );
}
