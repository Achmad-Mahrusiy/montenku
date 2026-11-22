# DECISIONS.md (Montenku)

Format per keputusan: **Konteks → Opsi → Pilihan → Alasan**. Status `Usulan` berarti menunggu persetujuan. Pertanyaan Q1–Q5 disetujui dengan rekomendasi default pada 22 Nov 2026.
Diagram dan ERD ada di [docs/fase-0-arsitektur.md](docs/fase-0-arsitektur.md).

---

## D-001 Library zona waktu: Temporal (`temporal-polyfill`)
Status: Disetujui (22 Nov 2026)

**Konteks.** Pengingat harus tepat di zona waktu akun, termasuk zona yang punya DST. Kasus sulitnya: jam yang tidak ada (saat jam maju) dan jam yang muncul dua kali (saat jam mundur).

**Opsi.**
- `date-fns-tz`: kecil dan sudah dikenal, tapi bekerja di atas `Date` (selalu instant + zona host). Perilaku di jam DST yang ambigu tidak bisa dipilih secara eksplisit.
- Temporal: punya tipe terpisah untuk "jam dinding" (`PlainDateTime`) dan "momen di zona" (`ZonedDateTime`), plus opsi `disambiguation` yang eksplisit.

**Pilihan.** Temporal lewat paket `temporal-polyfill`, diimpor hanya di satu modul `src/lib/time.ts`.

**Alasan.**
- Tipe yang berbeda untuk jam dinding dan instant membuat bug zona waktu ketahuan saat compile, bukan saat produksi.
- Temporal sudah Stage 4 (Maret 2026) dan native di Node 26, runtime default Vercel saat ini. Safari stable belum mendukung, jadi polyfill tetap dipakai di client; polyfill ini otomatis memakai versi native jika tersedia.
- Satu modul pembungkus berarti nanti cukup menghapus polyfill tanpa mengubah kode lain.

---

## D-002 Occurrence jadwal berulang: dihitung saat dibutuhkan
Status: Disetujui (22 Nov 2026)

**Konteks.** "Upload tiap Selasa dan Jumat 19:00" tidak punya tanggal akhir.

**Opsi.**
1. Materialisasi: buat satu baris per kemunculan untuk N bulan ke depan.
2. Hitung saat dibutuhkan: simpan aturan, hitung kemunculan untuk rentang yang sedang ditampilkan.

**Pilihan.** Opsi 2. Yang disimpan hanya pengecualian (`skip`/`move`) dan item yang sudah mulai dikerjakan.

**Alasan.**
- Mengubah aturan cukup mengubah satu baris, tanpa migrasi ratusan baris.
- Tidak ada job yang harus terus "memperpanjang" baris ke masa depan.
- Biaya hitungnya kecil: satu bulan kalender untuk beberapa aturan hanya puluhan kemunculan.
- Pengecualiannya: **pengingat** tetap dimaterialisasi, tapi hanya 48 jam ke depan (D-005), karena butuh status dan idempotency per baris.

---

## D-003 Cara memakai `rrule`: tanggal "mengambang", tanpa TZID
Status: Disetujui (22 Nov 2026)

**Konteks.** Dukungan TZID di `rrule` bergantung pada Intl dan zona host, dan ada laporan bug (hasil `RRule` vs `RRuleSet` tidak konsisten, regresi `after()` dengan TZID).

**Opsi.** Memakai TZID bawaan `rrule`, atau memakai `rrule` hanya untuk aritmetika kalender.

**Pilihan.** `rrule` menerima `dtstart` berupa komponen jam dinding yang dibungkus `Date.UTC(...)`, tanpa TZID. Konversi ke instant dilakukan oleh Temporal (D-001).

**Alasan.**
- `rrule` hanya mengerjakan bagian yang memang ia kuasai (pola kalender), sedangkan Temporal mengurus zona waktu.
- Hasilnya tidak bergantung pada TZ server. CI tetap menjalankan test dengan beberapa nilai `TZ` untuk membuktikannya.

---

## D-004 `occurrence_key` = jam dinding asli
Status: Disetujui (22 Nov 2026)

**Konteks.** Pengecualian, item tertaut, dan pengingat harus menunjuk ke kemunculan tertentu secara stabil.

**Opsi.** Instant UTC, nomor urut kemunculan, atau jam dinding lokal.

**Pilihan.** String jam dinding `YYYY-MM-DDTHH:mm` dari jadwal aslinya (sebelum digeser).

**Alasan.**
- Instant berubah saat zona akun diganti, sehingga pengecualian akan lepas.
- Nomor urut berubah saat aturan diedit.
- Jam dinding tetap sama di kedua kasus tersebut, dan mudah dibaca saat debugging.

---

## D-005 Pengisian pengingat: satu fungsi `reconcile()`, jendela 48 jam
Status: Disetujui (22 Nov 2026)

**Konteks.** Delay maksimum Vercel Queues 7 hari, dan delay yang melebihi retensi pesan ditolak (retensi default 24 jam). Cron Vercel di Hobby berjalan minimal 1x sehari dengan presisi ±59 menit, dan bisa terlewat atau berjalan ganda.

**Opsi.** Jendela 7 hari (sesuai batas maksimum) atau jendela pendek.

**Pilihan.**
- Jendela **48 jam dihitung dari `send_at`**, `retentionSeconds = delay + 24 jam`. Pencarian kemunculan melihat sejauh 48 jam + offset terbesar aturan itu, supaya pengingat "H-3 hari" dibuat tepat waktu.
- Cron harian dan penyapu memanggil **fungsi `reconcile()` yang sama**. Fungsi ini memateralisasi baris, memulihkan baris `sending` yang macet, **mengirim langsung** pending yang sudah lewat waktu lewat `deliver()` (fungsi yang sama dengan konsumen), lalu meng-enqueue pending masa depan yang belum di-enqueue untuk `send_at` saat ini.
- Saat item atau aturan diubah, baris yang jatuh tempo dalam jendela langsung di-enqueue setelah transaksi commit, tanpa menunggu cron.

**Alasan.**
- Jendela 48 jam berarti satu kali cron yang terlewat tidak membuat pengingat hilang.
- Pesan yang tidak bisa dibatalkan (D-006) jadi lebih sedikit menumpuk.
- Masih ada ruang retry sebelum pesan kedaluwarsa.
- Satu jalur kode yang idempotent lebih mudah dites daripada tiga job terpisah.
- Kolom `enqueued_send_at` membuat tabel `reminders` sekaligus berperan sebagai outbox: jika enqueue setelah commit gagal, `reconcile()` berikutnya akan mengulanginya.

---

## D-006 Pembatalan dan penjadwalan ulang lewat DB, dengan dua kunci idempotency
Status: Disetujui (22 Nov 2026)

**Konteks.** Vercel Queues tidak punya API untuk membatalkan pesan yang sudah dikirim. Pengiriman pesannya at-least-once.

**Pilihan.**
- Membatalkan = `status='cancelled'`. Menggeser = mengubah `send_at` lalu enqueue pesan baru.
- Konsumen selalu membaca ulang baris dan berhenti (ack) jika baris tidak ada, bukan `pending`, atau `send_at`-nya tidak sama dengan isi pesan.
- Kunci unik DB: `(reminder_setting_id, occurrence_key)`. Kunci idempotency queue: `id:send_at`.

**Alasan.**
- DB menjadi satu-satunya sumber kebenaran, sedangkan pesan hanya "ketukan pintu".
- Dedup queue berlaku selama retensi pesan. Kalau kuncinya hanya `id`, pesan untuk jadwal yang digeser akan dianggap duplikat dan dibuang. Itulah alasan ada dua kunci.
- Batas yang diketahui: jika pengingat digeser A → B → kembali ke A dalam masa retensi, pesan A yang baru dibuang dedup. Penyapu tetap mengirimnya, tapi bisa telat hingga sekitar 30 menit. Ini diterima; kalau tidak, kunci bisa diganti ke penghitung versi.

---

## D-007 Tambah status `sending` dengan lease (menyimpang dari brief)
Status: Disetujui (22 Nov 2026)

**Konteks.** Brief meminta `UPDATE ... WHERE status='pending'` lalu kirim email jika satu baris berubah. Jika update itu langsung ke `sent` lalu fungsi crash atau Resend gagal, pengingat dianggap terkirim padahal tidak, dan hilang tanpa jejak.

**Opsi.**
1. Klaim langsung ke `sent`: tidak pernah ganda, tapi bisa hilang.
2. Kirim dulu, baru tandai: tidak hilang, tapi bisa ganda.
3. Klaim ke `sending` + `claimed_at` (lease), kirim dengan `Idempotency-Key` Resend, lalu tandai `sent`.

**Pilihan.** Opsi 3. Status menjadi `pending | sending | sent | cancelled | failed`.
- Resend gagal: kembali ke `pending`, `attempts+1`, lalu lempar error agar queue mengulang dengan backoff.
- Setelah 5 percobaan: `failed`, ditampilkan di UI.
- Konsumen diset `maxDeliveries` eksplisit karena defaultnya tidak terbatas dan Vercel Queues tidak punya dead-letter queue.
- Penyapu mengembalikan baris `sending` yang lebih tua dari 5 menit ke `pending`, lalu langsung mengirimnya lewat `deliver()`. Enqueue ulang tidak dipakai karena akan dibuang dedup queue (kunci `id:send_at` sama).

**Alasan.**
- UPDATE bersyarat tetap menjamin hanya satu pekerja yang mengirim, entah itu konsumen atau penyapu.
- Jika crash terjadi setelah email terkirim tapi sebelum status `sent`, pengiriman ulang memakai kunci Resend yang sama (`reminder:id:send_at`, berlaku 24 jam), sehingga Resend tidak mengirim dua kali.
- Hasilnya: tidak hilang dan tidak ganda.

**Test wajib di Fase 4 (jam palsu, Resend dan queue di-mock):**
- Pesan yang sama dikirim 2x: email terkirim 1x.
- Konsumen dan penyapu berjalan bersamaan untuk baris yang sama: email terkirim 1x.
- Crash setelah klaim (sebelum Resend): penyapu memulihkan dan mengirim, email terkirim 1x.
- Crash setelah Resend sukses (sebelum `sent`): pengiriman ulang memakai kunci Resend yang sama, Resend mock mencatat 1 email.
- Resend gagal 5x: status `failed`.
- Item digeser atau dihapus: pesan lama menjadi no-op.

---

## D-008 Isolasi data dijaga DAL; RLS hanya menutup Data API
Status: Disetujui (22 Nov 2026)

**Konteks.** App terhubung sebagai role `postgres` lewat pooler, dan role ini mem-bypass RLS.

**Opsi.**
1. RLS per-pengguna dengan role khusus + `SET LOCAL app.user_id` di setiap transaksi.
2. DAL tunggal yang memaksa `user_id` + RLS deny-all.

**Pilihan.** Opsi 2, ditambah FK komposit `(account_id, user_id)` sebagai lapisan kedua di DB.

**Alasan.**
- Opsi 1 lebih kuat, tapi menambah kerumitan di setiap query dan rawan salah dengan transaction pooler.
- Untuk produk ini, DAL + lint + test isolasi sudah cukup dan mudah dijelaskan.
- RLS deny-all tetap wajib, karena tanpanya tabel bisa dibaca siapa pun lewat anon key.
- Bisa naik ke opsi 1 nanti tanpa mengubah skema.

---

## D-009 Penjadwal: Cron Jobs untuk pengisi harian, Vercel Schedules untuk penyapu
Status: Disetujui (22 Nov 2026)

**Konteks (dari dokumentasi Vercel, dicek 22 Nov 2026).**
- Cron Jobs kini berlabel *legacy*. Di Hobby: minimal sekali sehari, presisi ±59 menit; ekspresi seperti `*/30 * * * *` gagal saat deploy.
- Vercel Schedules adalah penggantinya, masih *Beta* di semua plan. Di Hobby: paling sering tiap 15 menit, jitter selalu 15 menit, kuota 5.000 run per periode tagihan. Dikonfigurasi lewat `vercel.json` (`schedules` + `experimentalTriggers` tipe `schedule/v1beta`).
- GitHub Actions: gratis di repo publik, tapi workflow terjadwal dimatikan setelah 60 hari tanpa aktivitas. Di repo privat ada jatah sekitar $12/bulan, dan `*/15` (≈2.900 run/bulan) berisiko melewatinya.

**Pilihan.**
- Pengisi harian: Cron Jobs (`0 1 * * *`), sesuai brief.
- Penyapu: Vercel Schedules tiap 15 menit (≈2.880 run/bulan, masih di bawah 5.000).
- Keduanya memanggil `/api/cron/reconcile` dengan `CRON_SECRET`.

**Alasan.**
- Dua penjadwal yang berbeda produk: jika Schedules (Beta) bermasalah, Cron Jobs harian tetap mengisi antrean.
- Penyapu hanya jaring pengaman. Ketepatan waktu tetap dari pesan tertunda di queue, jadi jeda penyapu sampai sekitar 30 menit (interval + jitter) bisa diterima.
- GitHub Actions hanya dipakai untuk keep-alive harian (D-012), bukan penyapu.

---

## D-010 Vercel Queues di balik satu adapter
Status: Disetujui (22 Nov 2026)

**Konteks.** Dokumentasi menyebut Queues "Beta on all plans". Konfigurasinya memakai `experimentalTriggers` dengan `type: "queue/v2beta"`. Paketnya `@vercel/queue` (`send`, `handleCallback`).

**Pilihan.** Pakai Vercel Queues (tidak perlu QStash). Semua pemanggilan queue ada di `src/server/queue.ts`, dan test me-mock modul ini.

**Alasan.** API Beta bisa berubah. Dengan satu adapter, perubahan API atau pindah ke QStash hanya menyentuh satu file. Ketersediaan di akunmu tetap dicek di Fase 1.

---

## D-011 Penamaan: `content_accounts`, bukan `accounts`
Status: Disetujui (22 Nov 2026)

**Konteks.** Better Auth sudah memakai tabel `account` untuk akun login.

**Pilihan.** Akun konten = `content_accounts` di DB dan `ContentAccount` di kode. UI tetap menulis "Akun konten".

**Alasan.** Menghindari salah join dan kebingungan saat membaca kode.

---

## D-012 Keep-alive berlapis
Status: Disetujui (22 Nov 2026)

**Konteks.** Supabase Free mem-pause proyek setelah 1 minggu tidak aktif. GitHub mematikan workflow terjadwal di repo publik yang 60 hari tanpa aktivitas.

**Pilihan.** `/api/health` (query `select 1`) dipanggil GitHub Actions harian sesuai brief. Cron `reconcile()` harian di Vercel juga menyentuh DB.

**Alasan.** Dua sumber aktivitas yang independen, tanpa kode tambahan, karena cron memang sudah ada.

---

## Pertanyaan terbuka (butuh jawabanmu sebelum Fase 3–5)

| # | Pertanyaan | Rekomendasi default |
|---|---|---|
| Q1 | Zona waktu akun diganti (Jakarta → Tokyo). Aturan "Selasa 19:00" tetap 19:00 di zona baru, atau tetap di momen yang sama (jadi 21:00 Tokyo)? Bagaimana dengan item sekali-jadi? | Aturan: **tetap 19:00 jam dinding** (ini kebiasaan lokal). Item sekali-jadi: **tetap momen yang sama** (bisa jadi janji dengan brand). Pending reminder akun itu dihitung ulang; yang sudah terkirim tidak disentuh. |
| Q2 | Jam senyap: pengingat ditunda sampai jam senyap selesai, atau dibuang? | **Ditunda** ke akhir jam senyap. Jika hasil penundaan melewati waktu posting, kirim tepat sebelum jam senyap mulai. Jam senyap memakai `user_settings.timezone`. |
| Q3 | RRULE diedit: nasib pengecualian lama dan pending reminder? | Edit di tempat. Pengecualian yang kuncinya tidak lagi cocok dibiarkan (diabaikan). Item tertaut tetap di `target_at`-nya. Pending reminder masa depan dibatalkan lalu dibuat ulang oleh `reconcile()`. |
| Q4 | Bentrok = jam yang sama persis (menit), atau dalam rentang, mis. ±30 menit? | **Menit yang sama persis**, sesuai brief ("jam yang sama"). |
| Q5 | D-007 menambah status `sending`, menyimpang dari daftar status di brief. Setuju? | **Setuju.** Tanpa status ini, crash setelah klaim membuat pengingat hilang. |

Asumsi lain (koreksi jika salah):
- Catatan wajib punya akun konten; tautan ke item opsional.
- Tag disimpan sebagai `text[]` di item, tanpa tabel tag.
- Pengingat yang waktunya sudah lewat saat dibuat langsung dikirim.

---

## D-013 Database dev: Supabase cloud; database test: PGlite
Status: Disetujui (22 Nov 2026), menggantikan pilihan awal Docker + Supabase CLI

**Konteks.** Test isolasi dan pemeriksaan RLS butuh Postgres sungguhan. Supabase CLI lokal sempat dicoba, tapi butuh Docker Desktop: sekitar 7–8 GB disk dan beberapa GB RAM. Terlalu berat untuk laptop yang dipakai.

**Opsi.**
1. Docker + Supabase CLI.
2. Supabase cloud untuk dev, PGlite untuk test.
3. Proyek Supabase kedua khusus test.
4. Ganti ke MySQL.

**Pilihan.** Opsi 2.
- Dev memakai proyek Supabase Free di web: transaction pooler untuk app, session pooler untuk migrasi.
- Test memakai PGlite (Postgres yang dikompilasi ke WASM, sekitar 28 MB di `node_modules`). PGlite dijalankan otomatis oleh `tests/helpers/global-setup.ts` lewat `@electric-sql/pglite-socket`, sehingga kode app tetap memakai `postgres-js` tanpa perubahan.
- CI nanti memakai cara yang sama.

**Alasan.**
- Tanpa install berat. Database test selalu kosong di setiap run dan tidak pernah menyentuh data dev.
- MySQL ditolak karena desain Fase 0 bergantung pada fitur Postgres (`timestamptz`, RLS, `pg_policies`) dan hosting gratis untuk Vercel.

**Trade-off.**
- PGlite tidak punya role Supabase (`anon`/`authenticated`). Karena itu test RLS memeriksa katalog (`pg_tables.rowsecurity`, `pg_policies`), bukan mencoba query sebagai `anon`.
- Satu proses PGlite melayani query satu per satu, sehingga test berjalan berurutan.

---

## D-014 Node 24.x dikunci di `engines`
Status: Usulan

**Konteks.** Laptop memakai Node 24, sedangkan default Vercel saat ini Node 26.

**Pilihan.** `"engines": { "node": "24.x" }` dan `@types/node@24`.

**Alasan.** Versi yang sama di laptop, CI, dan Vercel, jadi bug "jalan di laptop tapi tidak di server" berkurang. Temporal tetap lewat polyfill (D-001), jadi tidak bergantung pada Node 26.

---

## D-015 Nama folder rute berbahasa Indonesia
Status: Usulan

**Konteks.** Brief: UI berbahasa Indonesia, kode berbahasa Inggris. URL terlihat oleh pengguna.

**Pilihan.** Segmen URL berbahasa Indonesia (`/masuk`, `/daftar`, `/akun-konten`). Nama file, fungsi, variabel, dan tabel tetap bahasa Inggris.

**Alasan.** URL adalah bagian dari UI yang dibaca pengguna. Kalau kamu lebih suka URL berbahasa Inggris, ini cukup diganti dengan mengganti nama folder sebelum Langkah 3.

---

## D-016 Aturan lint: database hanya boleh diimpor oleh DAL
Status: Usulan

**Konteks.** D-008 menjadikan DAL satu-satunya jalan ke database.

**Pilihan.** Aturan ESLint `no-restricted-imports` melarang impor `@/db` di luar `src/server/dal/**`, `src/db/**`, dan `src/lib/auth.ts`.

**Alasan.** Kesalahan yang paling berbahaya (query tanpa filter `user_id` di halaman atau action) sudah gagal di `npm run lint`, sebelum sampai ke review atau test.
