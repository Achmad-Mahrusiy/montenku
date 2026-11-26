import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ScrollReveal } from "@/app/(app)/scroll-reveal";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Montenku: jadwal konten untuk banyak akun",
  description: "Atur posting TikTok, Instagram, dan YouTube untuk banyak akun, lengkap dengan zona waktu dan pengingat.",
};

// The public front page (Figma "v3 Desktop / Beranda", D-043). Visitors without a session see it at "/": proxy.ts
// rewrites "/" here, so signed-in users keep the dashboard at the same address. The dashboard and calendar pictures are
// drawings with made-up data, hidden from screen readers.

const features = [
  ["Akun konten", "Tambahkan akun TikTok, Instagram, dan YouTube, masing-masing dengan warna dan zona waktunya."],
  ["Jadwal berulang", "Simpan kebiasaan seperti tiap Selasa dan Jumat 19:00. Tanggalnya dihitung otomatis."],
  ["Konten", "Isi slot dengan judul, tahap produksi, tenggat, dan catatan."],
  ["Pengingat", "Email dan notifikasi push datang sebelum waktunya posting."],
] as const;

const values = [
  ["calendar", "Kalender gabungan", "Semua akun dalam satu kalender, atau saring per akun. Tampilan Bulan, Minggu, dan Daftar."],
  ["globe", "Zona waktu per akun", "Akun di Jepang tetap tampil di jam Tokyo, jadi 19:00 di sana tidak tertukar dengan 19:00 WIB."],
  ["alert", "Peringatan bentrok", "Dua posting satu akun di menit yang sama langsung ditandai, sebelum terlanjur diunggah."],
] as const;

const steps = [
  ["Daftar dan tambah akun konten", "Nama, platform, handle, warna, dan zona waktu. Setiap akun tampil dengan warnanya sendiri."],
  ["Buat jadwal berulang", "Misalnya upload tiap Selasa dan Jumat 19:00. Setiap kemunculan bisa dilewati atau digeser."],
  ["Isi slot jadi konten", "Judul, tahap Ide sampai Terposting, tenggat per tahap, dan catatan markdown."],
  ["Pasang pengingat", "Tepat waktu, 1 jam sebelum, atau H-1. Lewat email dan notifikasi push di perangkatmu."],
] as const;

const week = [
  ["Sen", []],
  ["Sel", [["#c63d8f", "06:30 Rute pagi"]]],
  ["Rab", [["#e8603c", "19:00 Telur balado"], ["#2683eb", "19:30 SQL JOIN"]]],
  ["Kam", []],
  ["Jum", [["#e8603c", "19:00 Sop iga"], ["#e8603c", "19:00 Es teh"]]],
  ["Sab", [["#c63d8f", "06:30 Car free day"]]],
  ["Min", []],
] as const;

const container = "mx-auto max-w-7xl px-4 sm:px-6 lg:px-12";

function Icon({ name }: { name: (typeof values)[number][0] }) {
  const paths: Record<typeof name, ReactNode> = {
    calendar: <path d="M4 7h16M8 3v4m8-4v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
    globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />,
    alert: <path d="M12 9v4m0 3.5v.5M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function DashboardPicture() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-foreground bg-background p-4 text-left sm:p-6">
      <p className="font-sans text-2xl font-medium">Selamat pagi, Rina</p>
      <p className="mt-1 text-lg text-muted-foreground">3 posting hari ini, semua pengingat sudah terjadwal.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-card p-4">
          <span className="font-mono text-xs text-muted-foreground">Siap diunggah minggu ini</span>
          <span className="mt-2 block text-5xl font-medium">8 / 12</span>
          <span className="mt-3 block h-1.5 rounded-full bg-muted">
            <span className="block h-full w-2/3 rounded-full bg-gold" />
          </span>
        </div>
        <div className="rounded-xl bg-card p-4">
          <span className="font-mono text-xs text-muted-foreground">Pengingat terkirim</span>
          <span className="mt-2 block text-5xl font-medium">24</span>
          <span className="mt-2 block font-mono text-xs text-muted-foreground">↑ 6 dari minggu lalu</span>
        </div>
        <div className="rounded-xl bg-card p-4">
          <span className="rounded-[5px] bg-warning-surface px-2 py-0.5 font-mono text-xs text-warning">Bentrok</span>
          <span className="mt-3 block text-lg leading-snug font-medium">Jumat 19:00 di Masak Hemat punya 2 posting</span>
          <span className="mt-1 block font-mono text-xs text-muted-foreground">Geser salah satunya</span>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl bg-card p-4 max-md:hidden">
        <span className="font-mono text-xs text-muted-foreground">Minggu ini · 23–29 November</span>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {week.map(([day, chips]) => (
            <div key={day} className="grid content-start gap-1">
              <span className="font-mono text-xs">{day}</span>
              {chips.length === 0 ? <span className="font-serif text-sm text-muted-foreground">Kosong</span> : null}
              {chips.map(([color, label]) => (
                <span key={label} className="flex items-center gap-1.5 truncate rounded-md px-2 py-1 font-mono text-[11px]" style={{ background: `color-mix(in srgb, ${color} 14%, white)` }}>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <header className={`${container} flex h-16 items-center justify-between gap-4 lg:h-[72px]`}>
        <Link href="/" className="rounded-md font-heading text-2xl font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Montenku
        </Link>
        <nav aria-label="Navigasi beranda">
          <ul className="flex items-center gap-1 text-[15px] font-medium">
            <li className="max-sm:hidden">
              <Link href="#cara-pakai" className="flex h-11 items-center px-3 underline-offset-4 hover:underline">Cara pakai</Link>
            </li>
            <li className="max-sm:hidden">
              <Link href="#fitur" className="flex h-11 items-center px-3 underline-offset-4 hover:underline">Fitur</Link>
            </li>
            <li>
              <Link href="/masuk" className="flex h-11 items-center px-3 underline-offset-4 hover:underline">Masuk</Link>
            </li>
            <li>
              <Link href="/daftar" className="flex h-11 items-center px-3 underline-offset-4 hover:underline">
                Daftar gratis<span aria-hidden="true">&nbsp;→</span>
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main>
        <section className={`${container} pt-12 pb-16 text-center lg:pt-20 lg:pb-24`}>
          <h1 className="text-[2.75rem] leading-[1.02] tracking-tight sm:text-6xl lg:text-[80px]">
            <span className="block font-serif">Semua jadwal kontenmu,</span>
            <span className="block font-medium">dalam satu kalender</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-foreground/85 lg:text-xl">
            Atur posting TikTok, Instagram, dan YouTube untuk banyak akun, lengkap dengan zona waktu dan pengingat.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/daftar">Daftar gratis</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/masuk">Saya sudah punya akun</Link>
            </Button>
          </div>
          <div className="mt-12 lg:mt-16">
            <DashboardPicture />
          </div>
        </section>

        <section id="fitur" data-reveal aria-labelledby="fitur-title" className={`${container} scroll-mt-6 py-16 lg:py-24`}>
          <h2 id="fitur-title" className="mx-auto max-w-2xl text-center text-3xl leading-tight font-medium tracking-tight lg:text-[40px]">
            Semua yang dibutuhkan untuk merencanakan dan mengunggah tepat waktu
          </h2>
          <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div aria-hidden="true" className="flex min-h-72 items-center justify-center rounded-xl bg-linear-to-b from-marker to-background p-6 lg:min-h-96">
              <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-sm">
                <span className="font-mono text-xs text-muted-foreground">Montenku · notifikasi</span>
                <span className="mt-2 block text-lg font-medium">1 jam lagi: Resep nasi goreng 10 ribu</span>
                <span className="mt-1 block font-serif text-muted-foreground">Masak Hemat, posting 19:00 WIB</span>
              </div>
            </div>
            <div>
              <ol className="divide-y border-y">
                {features.map(([title, text], i) => (
                  <li key={title} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-5">
                    <h3 className="text-lg font-medium">{title}</h3>
                    <span className="font-mono text-[13px] text-muted-foreground">({String(i + 1).padStart(2, "0")})</span>
                    <p className="col-span-2 text-muted-foreground">{text}</p>
                  </li>
                ))}
              </ol>
              <Button asChild className="mt-6">
                <Link href="/daftar">Daftar gratis</Link>
              </Button>
            </div>
          </div>
        </section>

        <section data-reveal aria-labelledby="nilai-title" className="bg-marker/60 py-16 lg:py-24">
          <div className={container}>
            <h2 id="nilai-title" className="text-center text-4xl leading-[1.05] tracking-tight lg:text-[64px]">
              <span className="block font-serif">Jelas untuk direncanakan</span>
              <span className="block font-medium">Siap untuk dikerjakan</span>
            </h2>
            <ul className="mt-12 grid gap-4 md:grid-cols-3">
              {values.map(([icon, title, text]) => (
                <li key={title} className="rounded-xl bg-card p-6">
                  <Icon name={icon} />
                  <h3 className="mt-6 text-lg font-medium">{title}</h3>
                  <p className="mt-1 text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="cara-pakai" data-reveal aria-labelledby="cara-title" className={`${container} scroll-mt-6 py-16 lg:py-24`}>
          <h2 id="cara-title" className="text-3xl font-medium tracking-tight lg:text-[40px]">
            Cara pakai Montenku
          </h2>
          <ol className="mt-10 divide-y border-y">
            {steps.map(([title, text], i) => (
              <li key={title} className="grid gap-2 py-6 md:grid-cols-[160px_1fr_1fr] md:gap-8">
                <span className="font-mono text-[13px] text-muted-foreground">Langkah {String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-reveal aria-labelledby="ajakan-title" className={`${container} py-16 text-center lg:py-24`}>
          <h2 id="ajakan-title" className="text-3xl font-medium tracking-tight lg:text-[40px]">
            Siap merapikan jadwal kontenmu?
          </h2>
          <Button asChild className="mt-6">
            <Link href="/daftar">Daftar gratis</Link>
          </Button>
        </section>
        <ScrollReveal />
      </main>

      <SiteFooter />
    </>
  );
}
