import Link from "next/link";
import { Button } from "@/components/ui/button";

// For URLs that match no route at all.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <p className="font-heading text-3xl font-bold tracking-tight">Montenku</p>
      <h1 className="mt-8 font-heading text-2xl font-bold">Halaman tidak ditemukan</h1>
      <p className="mt-1 text-muted-foreground">Alamat ini tidak ada. Mungkin tautannya salah ketik.</p>
      <Button asChild className="mt-6 w-full">
        <Link href="/">Ke halaman utama</Link>
      </Button>
    </main>
  );
}
