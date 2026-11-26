// The Silk panel beside the Masuk/Daftar form (Figma v3 "Panel cerita", D-043), so the page explains Montenku instead of
// leaving an empty half. The sample day is decoration with made-up data: hidden from screen readers, and left out on phones
// where the panel sits under the form and should stay short.
const sample = [
  { time: "12:00", color: "#c63d8f", title: "Rute pagi Taman Suropati", account: "Jalan Pagi · TikTok" },
  { time: "19:00", color: "#e8603c", title: "Resep nasi goreng 10 ribu", account: "Masak Hemat · Instagram" },
  { time: "20:00", color: "#2683eb", title: "Belajar SQL JOIN dalam 10 menit", account: "Kode Santai · YouTube" },
];

const benefits = [
  { title: "Kalender gabungan", text: "Semua akun dalam satu tampilan." },
  { title: "Pengingat tepat waktu", text: "Email dan push sebelum posting." },
  { title: "Tanda bentrok", text: "Ketahuan sebelum terlanjur." },
];

export function StoryPanel() {
  return (
    <section aria-labelledby="story-title" className="grid gap-6 rounded-xl bg-marker p-6 sm:p-8 lg:gap-7 lg:p-12">
      <p className="font-mono text-[13px] text-muted-foreground">Montenku · penjadwal konten multi-akun</p>
      <h2 id="story-title" className="text-3xl leading-[1.05] tracking-tight lg:text-[52px]">
        <span className="block font-serif">Semua akunmu,</span>
        <span className="block font-medium">satu kalender.</span>
      </h2>
      <p className="text-lg leading-relaxed text-foreground/85 max-lg:hidden">
        Rencanakan posting TikTok, Instagram, dan YouTube di satu tempat. Pengingat email dan push datang sebelum jamnya,
        jadi tidak ada yang terlewat.
      </p>

      <div aria-hidden="true" className="rounded-xl bg-card p-5 max-lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground">Hari ini · Senin, 23 Nov</span>
          <span className="rounded-[5px] bg-marker px-2 py-0.5 font-mono text-xs">3 posting</span>
        </div>
        <ul className="mt-1 divide-y">
          {sample.map((row) => (
            <li key={row.time} className="flex items-center gap-3 py-3">
              <span className="w-12 text-lg font-medium tabular-nums">{row.time}</span>
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{row.title}</span>
                <span className="block font-mono text-xs text-muted-foreground">{row.account}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2.5 font-mono text-xs">
          <span className="size-2 shrink-0 bg-gold" />
          Pengingat: Resep nasi goreng tayang 2 jam lagi
        </div>
      </div>

      <ul className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        {benefits.map((b) => (
          <li key={b.title}>
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <span aria-hidden="true" className="size-2 shrink-0 bg-gold" />
              {b.title}
            </span>
            <span className="mt-1 block font-serif text-sm text-muted-foreground">{b.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
