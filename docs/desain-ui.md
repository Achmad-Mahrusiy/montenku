# Montenku: Desain UI (gambaran)

Figma: https://www.figma.com/design/lidZO5quXraPnM5sy2yKFS/Project (halaman "Montenku UI")

Status: **gambaran statis untuk persetujuan**. Belum ada prototipe klik; perilaku interaksi diverifikasi saat Fase 2+ dibangun.

## Design Read

(Ditulis setelah desain dibuat, berdasarkan jawabanmu "Studio kreator".) Desain ini dibaca sebagai: aplikasi kerja harian untuk content creator Indonesia yang mengelola beberapa akun, dengan gaya "studio kreator". Dial: **ENERGY 2 / RHYTHM 2 / MOTION 2** (MOTION baru berlaku saat implementasi).

## Isi file Figma

| Section | Isi |
|---|---|
| Fondasi: komponen | Button, NavItem, AccountTag, EventChip, ReminderBadge, StatusTrack, Field, BottomNav |
| Desktop (1440) | Dashboard Hari ini, Kalender Bulan, Kalender Minggu, Detail item, Jadwal berulang, Akun konten, Pengaturan |
| Mobile (375) | Dashboard, Kalender Daftar, Detail item, Jadwal berulang (daftar + editor), Akun konten, Pengaturan |
| State | Kosong, memuat, error |
| Dark mode (usulan) | Dashboard desktop + mobile memakai mode variabel Dark. Belum ada di brief, jadi perlu persetujuan |

Belum ada frame: tampilan Daftar versi desktop, tab "Minggu ini" di dashboard, dan halaman masuk/daftar (Better Auth).

Variabel: koleksi `Montenku/Warna` (mode Light/Dark) dan `Montenku/Ukuran` (spasi, radius). Nantinya keduanya dipetakan 1:1 ke CSS variable Tailwind/shadcn.

## Alasan tiap keputusan (satu baris)

- **Warna latar krem hangat (#F5F1EA), bukan putih:** terasa seperti meja kerja/kertas, dan membuat kartu putih terbaca sebagai lapisan tanpa perlu bayangan.
- **Satu aksen kuning kunyit (#F2C230) sebagai "stabilo":** dipakai hanya untuk "hari ini", "sekarang", nav aktif, dan pilihan aktif. Ini motif identitas Montenku: menandai yang penting seperti stabilo di jadwal kertas.
- **Warna akun konten adalah satu-satunya warna kuat lainnya:** kalender gabungan harus bisa dibedakan per akun sekilas. Setiap warna selalu ditemani nama akun, jadi tidak bergantung pada warna saja.
- **Bricolage Grotesque untuk angka/judul:** angka tanggal besar adalah titik fokus dashboard, dan font ini punya karakter kuat di ukuran besar.
- **Plus Jakarta Sans untuk UI:** dibuat untuk identitas kota Jakarta, cocok untuk produk berbahasa Indonesia, dan tetap jelas di 13–16px.
- **Tanpa bayangan, border 1px:** hierarki dibangun dari latar dan border; bayangan hanya akan membuat semuanya "melayang".
- **Radius 8–12px, tidak ada bentuk pill:** cukup ramah tanpa terlihat seperti template.
- **Navigasi samping hanya teks (tanpa ikon):** label lima tujuan sudah jelas; ikon generik tidak menambah informasi.
- **Slot jadwal berulang digambar garis putus-putus:** memperlihatkan model data Fase 0 (kemunculan virtual vs item nyata) langsung di UI.
- **Bentrok = border kuning tua + label teks "Bentrok":** peringatan, bukan error, jadi tidak memakai merah.
- **Mobile memakai tampilan Daftar sebagai kalender utama:** grid bulan terlalu padat di lebar 375px; Bulan/Minggu tetap tersedia lewat tab.
- **Bottom nav 5 tujuan berlabel teks, tinggi 44px:** sesuai batas maksimal 5 tujuan dan target sentuh minimum.
- **Dark mode lewat mode variabel, bukan warna terpisah:** satu sumber token. Ini masih usulan; toggle hanya dibangun kalau kamu setuju.
- **Tombol di peringatan gagal kirim = "Lihat konten", bukan "kirim ulang":** brief belum menyebut kirim ulang manual, jadi tidak ditambahkan tanpa persetujuan.

## Kontras (WCAG AA, dicek)

| Pasangan | Rasio |
|---|---|
| Teks sekunder #5E574D di krem #F5F1EA | 6.33 |
| Teks sekunder #5E574D di sunken #ECE6DC | 5.74 |
| Tinta #1C1A17 di kuning #F2C230 | 10.36 |
| Merah #B42318 di #FDECEA | 5.75 |
| Kuning tua #8A5A00 di #FFF4D6 | 5.41 |
| Hijau #1F7A4D di #E6F4EC | 4.69 |
| Dark: #B5ADA0 di #2A2722 | 6.69 |
| Dark: #FF8A80 di #3A1D1A | 6.71 |
| Dark: #F5C451 di #3A2F12 | 8.08 |

## Data contoh

Semua nama akun (Masak Hemat, Jalan Pagi, Kode Santai), judul konten, dan email `kamu@contoh.com` adalah **data contoh**, bukan data asli. Logo masih berupa **wordmark teks placeholder** "Montenku".
