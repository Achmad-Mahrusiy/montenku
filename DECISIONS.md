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

## D-013 Database dev: Supabase cloud; database test: Postgres asli lokal (embedded-postgres)
Status: Disetujui (22 Nov 2026). Menggantikan Docker + Supabase CLI, lalu PGlite.

**Konteks.** Test isolasi dan pemeriksaan RLS butuh Postgres sungguhan. Supabase CLI lokal butuh Docker Desktop (sekitar 7 GB disk, beberapa GB RAM), terlalu berat untuk laptop yang dipakai.

**Opsi.**
1. Docker + Supabase CLI.
2. Supabase cloud untuk dev, PGlite (Postgres versi WASM) untuk test.
3. Supabase cloud untuk dev, `embedded-postgres` (binary Postgres asli, tanpa Docker) untuk test.
4. Proyek Supabase kedua khusus test.
5. Ganti ke MySQL.

**Pilihan.** Opsi 3 (dipilih 22 Nov 2026 di Langkah 4).
- Dev memakai proyek Supabase Free di web: transaction pooler untuk app, session pooler untuk migrasi.
- Test memakai `embedded-postgres`: Postgres 18 asli yang dijalankan `tests/helpers/global-setup.ts` sebagai proses biasa di port 55432, datanya di folder sementara di luar OneDrive dan dihapus setelah test. Sekitar 110 MB di `node_modules` (Windows), hanya hidup selama `npm test`.
- CI nanti memakai cara yang sama (paket Linux sekitar 60 MB).

**Alasan.**
- Opsi 2 sempat dipakai, tapi gagal di Langkah 4: insert pertama dengan parameter enum memicu jalur "Describe ulang" milik postgres-js, dan PGlite lewat socket kehilangan statement di tengah jalan ("unnamed prepared statement does not exist"). Query yang sama berhasil di Supabase. Test yang gagal karena alat test, bukan karena kode, merusak kepercayaan pada test.
- Opsi 3 memakai protokol dan driver yang sama persis dengan produksi, tetap tanpa Docker.
- Opsi 4 tidak dipilih karena jaringan dev sering memutus koneksi baru ke Supabase dan test akan mengotori data cloud.
- MySQL ditolak karena desain Fase 0 bergantung pada fitur Postgres (`timestamptz`, RLS, `pg_policies`).

**Trade-off.**
- Paket `embedded-postgres` berlabel beta (versi `18.7.0-beta.19`). Kalau suatu saat rusak, opsi cadangannya PGlite dengan driver Drizzle khusus PGlite.
- Postgres lokal tidak punya role Supabase (`anon`/`authenticated`). Karena itu test RLS memeriksa katalog (`pg_tables.rowsecurity`, `pg_policies`), bukan mencoba query sebagai `anon`.
- File test berjalan berurutan karena berbagi satu database.
- Postgres test dijalankan dengan `io_method=sync`. Proses *I/O worker* Postgres 18 tidak ikut mati saat `embedded-postgres` mematikan database secara paksa di Windows, sehingga port 55432 tertahan dan run berikutnya menggantung (terjadi 23 Nov 2026). Tanpa I/O worker masalah itu hilang; kalau port tetap terpakai, setup test langsung gagal dengan pesan yang jelas.
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

---

## D-017 Form masuk dan daftar memakai Server Actions, bukan `authClient`
Status: Usulan

**Konteks.** Better Auth bisa dipanggil dari browser (`authClient.signIn.email`) atau dari server (`auth.api.signInEmail` di dalam Server Action). Brief: semua input dari luar divalidasi Zod.

**Opsi.** (a) `authClient` di browser: request langsung ke `/api/auth/*`. (b) Server Action: form dikirim ke server kita, divalidasi Zod, lalu memanggil `auth.api`.

**Pilihan.** (b). File `src/lib/auth-client.ts` dihapus karena tidak dipakai. Route `/api/auth/[...all]` tetap dipasang untuk fitur Better Auth berikutnya (verifikasi email, reset kata sandi).

**Alasan.** Validasi Zod dan pesan error berbahasa Indonesia ada di satu tempat (`src/server/actions/auth.ts`), form tetap bisa dikirim walau JavaScript belum termuat, dan rate limit di Langkah 5 cukup dipasang di action yang sama. Konsekuensi: rate limit nanti juga harus menutup `/api/auth/*`, karena endpoint itu tetap bisa dipanggil langsung.

---

## D-018 Pengecekan sesi dua lapis: cookie di `proxy.ts`, sesi asli di halaman
Status: Usulan

**Konteks.** Next.js 16 memakai `proxy.ts` (dulu middleware). Membaca sesi dari database di setiap request membuat semua halaman lebih lambat.

**Pilihan.** `proxy.ts` hanya mengecek ada atau tidaknya cookie sesi lalu mengarahkan ke `/masuk`. Setiap halaman yang dilindungi memanggil `requireUser()` yang benar-benar memeriksa sesi ke database. Halaman `/masuk` dan `/daftar` mengalihkan pengguna yang sudah masuk ke `/` memakai sesi asli, bukan cookie.

**Alasan.** Cookie bisa dipalsukan, jadi proxy hanya mempercepat redirect, bukan pengaman. Pengecekan "sudah masuk" di proxy berbasis cookie bisa membuat redirect berputar (cookie kedaluwarsa: proxy kirim ke `/`, halaman kirim balik ke `/masuk`), jadi pengecekan itu ada di halaman.

---

## D-019 Akun konten diarsipkan, bukan dihapus permanen
Status: Usulan

**Konteks.** Brief meminta CRUD akun konten. Desain Figma (layar Akun konten, desktop dan mobile) memakai tombol **Arsipkan** dan **Pulihkan**, tanpa tombol hapus.

**Pilihan.** "Hapus" untuk akun konten = arsipkan (`archived_at` diisi). Akun yang diarsipkan tetap tampil di bawah daftar dengan label "diarsipkan" dan tombol **Pulihkan**, tapi hilang dari sidebar. Hapus permanen hanya ada untuk akun Montenku secara keseluruhan (layar Pengaturan, fase berikutnya).

**Alasan.** Nanti akun konten punya konten, jadwal, catatan, dan riwayat pengingat. Menghapusnya permanen karena salah klik akan menghapus semua itu. Arsip bisa dibatalkan, jadi tombolnya tidak perlu dialog konfirmasi.

**Catatan.** Jumlah jadwal dan konten per akun ("2 jadwal berulang, 14 konten" di Figma) belum ditampilkan karena tabelnya belum ada. Ditambahkan saat fiturnya dibuat, bukan diisi angka contoh.

---

## D-020 Rate limit: Upstash di Server Action, endpoint HTTP masuk/daftar ditutup
Status: Usulan

**Konteks.** Brief: Upstash ratelimit di login, pembuatan item, dan endpoint pemicu email. D-017 mencatat bahwa `/api/auth/*` juga harus tertutup, karena endpoint itu bisa dipanggil langsung tanpa lewat form.

**Pilihan.**
- Batas (sliding window, kunci di Redis berawalan `montenku:`):
  - Masuk: 20 per IP dan 5 per email per 15 menit.
  - Daftar: 5 per IP per jam.
  - Simpan akun konten dan item konten: 30 per pengguna per menit, satu kuota bersama.
  - Endpoint pemicu email belum ada; dibatasi saat dibuat.
- Email disimpan sebagai hash SHA-256 di Redis, bukan teks asli.
- `/api/auth/sign-in/email` dan `/api/auth/sign-up/email` ditutup lewat `disabledPaths` Better Auth (404). Panggilan `auth.api.*` dari Server Action tetap jalan, jadi satu-satunya jalan masuk adalah action yang dibatasi.
- Kalau Upstash tidak menjawab dalam 2 detik atau error: permintaan **diizinkan** dan error dicatat di log (fail open).
- Upstash boleh kosong di laptop (rate limit mati, ada peringatan di log). Di Vercel production (`VERCEL_ENV=production`) wajib diisi; kalau tidak, app gagal menyala.

**Alasan.**
- Batas per email melindungi satu akun dari tebakan kata sandi dari banyak IP; batas per IP menahan satu mesin mencoba banyak akun.
- Fail open dipilih karena kalau Upstash bermasalah, lebih baik login tetap jalan beberapa menit tanpa batas daripada semua pengguna terkunci. Untuk produk ini risikonya kecil; bisa diganti fail closed nanti.
- Menutup endpoint lebih sederhana dan lebih kuat daripada memasang rate limit kedua di Better Auth.

**Catatan angka menit.** Jendela Upstash disejajarkan dengan jam (ember 15 menit sejak 00.00), bukan dihitung dari percobaan pertama, jadi pesan bisa berbunyi "Coba lagi dalam 8 menit" untuk batas 15 menit. Diuji dengan Upstash sungguhan (22 Nov 2026): setelah waktu itu lewat, percobaan berikutnya memang diizinkan.

**Trade-off.** Penyimpanan rate limit bawaan Better Auth (memori) tetap aktif untuk endpoint lain seperti `get-session`; di serverless memorinya tidak dibagi antar-instance, jadi lemah, tapi endpoint itu tidak menerima kata sandi.

---

## D-021 Item konten: tanggal wajib, catatan banyak per item, kepemilikan dicek database
Status: Disetujui (22 Nov 2026, jawaban awal Fase 2)

**Konteks.** Fase 2 menambah item konten, tenggat per tahap, dan catatan. Tiga hal tidak dijawab brief maupun Fase 0, jadi ditanyakan.

**Pilihan.**
- **Tanggal dan jam target wajib** (`content_items.target_at NOT NULL`). Menyimpang dari ERD Fase 0 yang membolehkan kosong. Setiap item selalu punya tempat di kalender.
- **Catatan bisa banyak per item.** Tabel `notes` hanya punya `item_id` (wajib), tanpa `account_id` seperti di ERD. Akun sebuah catatan selalu diambil dari itemnya, jadi saat item dipindah ke akun lain, catatannya tidak bisa tertinggal di akun lama.
- **Tenggat per tahap** di tabel `item_stage_deadlines` (satu baris per tahap yang diisi), hanya untuk naskah, produksi, editing, dan siap. Tahap "terposting" memakai `target_at`. Tabel ini diberi kolom `user_id` (tidak ada di ERD) supaya dashboard Fase 5 bisa langsung mencari tenggat milik pengguna.
- `content_items`, `item_stage_deadlines`, dan `notes` memakai foreign key komposit ke pasangan (id, user_id) induknya. Database menolak item di akun orang lain, atau tenggat/catatan di item orang lain, bahkan kalau DAL salah.
- Kolom `schedule_id` dan `occurrence_key` dari ERD belum dibuat; ditambahkan di Fase 3 bersama tabel `schedules`.

**Alasan.** Pilihan pengguna untuk tiga pertanyaan; sisanya mengikuti D-008.

---

## D-022 Kalender menampilkan jam dalam zona waktu tiap akun
Status: Disetujui (22 Nov 2026, jawaban awal Fase 2)

**Konteks.** Kalender "Semua akun" bisa berisi akun dengan zona waktu berbeda.

**Opsi.** (a) Setiap item tampil di jam dinding zona akunnya. (b) Semua item dikonversi ke satu zona milik pengguna.

**Pilihan.** (a). Jam dan tanggal target diisi dan ditampilkan dalam zona akun, sama seperti email pengingat (brief Fase 4). Item di akun yang zonanya bukan WIB diberi label zona (mis. JST).

**Alasan.** Kreator menjadwalkan posting untuk jam penontonnya; "19:00 di akun Tokyo" lebih bermakna daripada "17:00 WIB". Tidak butuh pengaturan zona pengguna sebelum Fase 5. Kalau semua akun WIB, tampilannya sama persis dengan Figma.

**Konsekuensi.** Dua item di akun berbeda zona yang tampil di jam yang sama di kalender belum tentu terjadi di momen yang sama. Deteksi bentrok (Fase 5) memang per akun, jadi tidak terpengaruh.

---

## D-023 Item konten dihapus permanen, dengan konfirmasi
Status: Usulan

**Konteks.** Akun konten diarsipkan (D-019), tapi layar Detail item di Figma punya tombol **Hapus konten**. Brief Fase 4 juga menyebut pengingat dibatalkan saat item dihapus.

**Pilihan.** Item dihapus permanen beserta tenggat dan catatannya (`ON DELETE CASCADE`). Tombolnya membuka dialog konfirmasi (`<dialog>` bawaan browser: Escape menutup, fokus awal di **Batal**). Setelah dihapus, pengguna kembali ke dashboard; setelah kalender ada (Langkah 4), kembali ke kalender.

**Alasan.** Item adalah satu konten, bukan wadah banyak data seperti akun konten, jadi arsip tidak sepadan dengan kerumitannya. Konfirmasi menahan salah klik.

**Catatan teknis.** Field status dan akun di form sengaja *uncontrolled* (`defaultChecked`/`defaultValue`). Saat diuji, versi *controlled* meninggalkan nilai lama di DOM setelah React mereset form sesudah simpan berhasil, sehingga simpan berikutnya diam-diam mengirim status lama.

---

## D-024 Catatan markdown: `react-markdown`, tanpa HTML mentah
Status: Usulan

**Konteks.** Brief: catatan markdown yang tertaut ke item. Catatan adalah teks dari pengguna yang ditampilkan kembali di halaman, jadi berisiko XSS kalau HTML di dalamnya ikut dijalankan.

**Opsi.** (a) `react-markdown`: mengubah markdown langsung jadi elemen React, tanpa `dangerouslySetInnerHTML`. (b) `marked` + sanitizer (mis. DOMPurify): menghasilkan string HTML yang harus dibersihkan dulu.

**Pilihan.** (a) `react-markdown@10.1.0` dengan `skipHtml`: tag HTML di dalam catatan dibuang, dan tautan `javascript:`/`data:` dikosongkan oleh `urlTransform` bawaan. Tautan biasa dibuka di tab baru dengan `rel="noopener noreferrer nofollow"`. Komponen yang sama dipakai untuk tampilan di server dan pratinjau di browser. Test di `tests/markdown.test.tsx` mengunci perilaku ini.

**Alasan.** Tidak ada string HTML yang perlu dipercaya, jadi tidak ada sanitizer yang bisa lupa dipasang. Tanpa plugin GFM (tabel, checklist) karena belum dibutuhkan; bisa ditambah nanti.

**Tata letak.** Panel Catatan ada di kolom kanan mulai layar 1280px (xl). Di 1024px kolom form terlalu sempit di samping sidebar, jadi panel turun ke bawah form; baris Akun/Tanggal/Jam memakai container query supaya jadi tiga kolom hanya kalau kartunya cukup lebar.

---

## D-025 Kalender: dirender di server, keadaan di URL, "hari ini" sementara memakai WIB
Status: Usulan

**Konteks.** Fase 2 meminta kalender Bulan, Minggu, dan Daftar dengan tampilan "Semua akun" dan filter per akun.

**Pilihan.**
- Tampilan, tanggal, dan filter disimpan di URL: `/kalender?tampilan=bulan|minggu|daftar&tanggal=YYYY-MM-DD&akun=<id>`. Nilai yang tidak valid kembali ke bawaan (Bulan, hari ini, Semua akun), bukan error.
- Ketiga tampilan adalah *server component*; semua tombol adalah tautan biasa. Tidak ada JavaScript tambahan di browser.
- Minggu dimulai hari Senin, seperti di Figma. Daftar menampilkan bulan yang dipilih, hanya hari yang punya konten.
- Item ditaruh di tanggal dan jam **zona akunnya** (D-022). Database diquery dengan rentang UTC yang dilebarkan untuk semua zona (−12 sampai +14 jam), lalu `placeOnCalendar()` menaruh tiap item ke harinya. Item di akun yang zonanya bukan WIB diberi label zona, mis. "19:00 GMT+9".
- Di HP: Bulan menampilkan titik warna per hari, dan seluruh kotak tanggal menjadi tautan ke Daftar hari itu. Minggu bisa digeser ke samping di dalam kotaknya sendiri; halaman tidak pernah meluber.
- Filter per akun memilih satu akun (atau Semua). Akun milik orang lain di URL tidak menampilkan apa pun, karena DAL tetap memfilter `user_id`.

**Batasan sementara.** "Hari ini" dan label zona kolom Minggu memakai Asia/Jakarta untuk semua pengguna (`CALENDAR_HOME_TIMEZONE`). Diganti dengan `user_settings.timezone` saat Pengaturan dibuat di Fase 5.

**Alasan.** URL membuat tampilan bisa di-refresh, ditandai, dan dibagikan tanpa state di browser. Render di server membuat halaman cepat dan tetap berfungsi walau JavaScript belum termuat.

---

## D-026 Jadwal berulang: tabel, editor mingguan, dan slot yang bisa diisi
Status: Disetujui sebagian (22 Nov 2026: "Isi konten" ikut Fase 3); sisanya Usulan

**Konteks.** Fase 3 membangun jadwal berulang sesuai D-002 sampai D-004 dan jawaban Q1/Q3. Figma punya tombol "Isi konten" yang mengubah satu slot menjadi item; pengguna memilih fitur itu ikut dibuat.

**Pilihan.**
- `schedules`: `rrule` (tanpa DTSTART/TZID), `dtstart_local` (jam dinding, tanpa zona), akun konten. `schedule_exceptions`: satu baris per kemunculan yang dilewati atau digeser, dengan kunci jam dinding asli (unik per jadwal).
- `content_items.schedule_id` + `occurrence_key`: item yang mengisi satu slot. Unik per slot, keduanya terisi atau keduanya kosong (check constraint), dan dijaga foreign key komposit `(schedule_id, user_id)` seperti D-008.
- Menghapus jadwal **tidak** menghapus item yang sudah dibuat dari slotnya; tautannya dilepas dulu oleh DAL. Item yang dipindah ke akun lain juga lepas dari slot.
- Editor hanya mingguan (hari + jam + tanggal mulai + tanggal berakhir opsional), seperti Figma. RRULE utuh tetap disimpan, jadi pola lain bisa ditambah tanpa migrasi.
- "Isi konten" membuat item berjudul sama dengan jadwal, status Ide, di jam slot (jam baru kalau slot digeser). Klik ganda tetap satu item (unique + `ON CONFLICT DO NOTHING`). Slot yang dilewati atau tanggal karangan ditolak.
- Kolom `active` dari ERD ada tapi belum dipakai di UI (tidak ada di Figma).

**Alasan.** Mengikuti desain Fase 0 yang sudah disetujui; kunci jam dinding membuat pengecualian dan slot terisi tetap menempel saat zona akun diganti (diuji).

---

## D-027 Halaman Jadwal berulang: panel lewat URL, 8 kemunculan berikutnya
Status: Usulan

**Konteks.** Layar Jadwal berulang di Figma: daftar jadwal, editor, dan "Kemunculan berikutnya" dengan Isi konten, Lewati, Geser, Batalkan lewati, Kembalikan.

**Pilihan.**
- Pola sama dengan Akun konten: `/jadwal?baru=1` dan `/jadwal?ubah=<id>` membuka panel; di HP panel tampil di atas daftar.
- "Kemunculan berikutnya" menampilkan 8 kemunculan dalam 2 bulan ke depan, termasuk yang dilewati, urut menurut tanggal aslinya (seperti Figma).
- Slot yang sudah terisi hanya punya tombol **Buka konten**: jam posting yang sebenarnya diatur di item itu sendiri, bukan di slot.
- **Geser** memakai `<details>` bawaan browser, jadi form kecilnya terbuka tanpa JavaScript tambahan.
- Dialog konfirmasi hapus kini satu komponen bersama (`src/components/confirm-delete-button.tsx`) untuk item dan jadwal.
- Bagian "Pengingat untuk tiap kemunculan" dari Figma menunggu Fase 4.

**Alasan.** Mengikuti desain dan pola yang sudah ada di app, dengan kode client sesedikit mungkin.

---

## D-028 Slot jadwal berulang di kalender
Status: Usulan

**Konteks.** Figma menampilkan slot jadwal yang belum diisi sebagai chip bergaris putus-putus "Slot kosong", dengan keterangan di atas kalender.

**Pilihan.**
- Kalender (Bulan, Minggu, Daftar) menggabungkan item konten dengan slot kosong dari jadwal berulang, dihitung saat halaman dibuka (`scheduleSlots()` di `src/lib/calendar.ts`, memakai mesin kemunculan yang sama dengan halaman Jadwal).
- Slot yang sudah diisi tidak tampil, karena itemnya sudah tampil sendiri. Slot yang dilewati tidak tampil; slot yang digeser tampil di jam barunya. Jadwal di akun yang diarsipkan tidak menghasilkan slot.
- Slot bergaris putus-putus dengan warna akunnya; di HP titiknya berongga. Label pembaca layar menghitung konten dan slot kosong secara terpisah.
- Klik slot membuka jadwalnya (`/jadwal?ubah=<id>`), bukan langsung membuat item, supaya tidak ada item yang terbuat karena salah klik. Di sana ada tombol "Isi konten".
- Filter per akun berlaku juga untuk slot.

**Alasan.** Satu sumber perhitungan untuk halaman Jadwal dan kalender, dan kalender tidak pernah menampilkan satu posting dua kali.

---

## D-029 Mesin pengingat: implementasi D-005 sampai D-007
Status: Disetujui sebagian (23 Nov 2026: Vercel ditunda ke Fase 7, Resend mode uji, tombol "Kirim ulang" ikut dibuat); sisanya Usulan

**Konteks.** Fase 4 Langkah 1 membangun inti pengingat sesuai desain Fase 0. Dokumentasi resmi Vercel Queues dibaca 23 Nov 2026 (`/docs/queues`, quickstart, sdk, concepts, pricing, api): `send(topic, payload, { delaySeconds, retentionSeconds, idempotencyKey })`, konsumen `handleCallback`, pengiriman at-least-once, tidak ada pembatalan pesan, tersedia Beta di Hobby (1 juta operasi). Menjalankannya di laptop butuh `vercel link` + `vercel env pull` (OIDC); tidak ada emulator lokal.

**Pilihan.**
- `reminder_settings`: offset (0 sampai 10.080 menit) pada **tepat satu** target, item atau jadwal. Tanpa `account_id` (diambil dari item atau jadwal, jadi tidak bisa basi). Offset yang sama tidak bisa dipasang dua kali.
- `reminders`: satu baris per (pengaturan, kemunculan), unik (kunci DB dari D-006). `occurrence_key = 'once'` untuk item tunggal.
- `reconcile({ now, userId? })` di `src/server/dal/reminders.ts`, lima langkah: materialisasi baris dalam 48 jam, batalkan yang tidak diinginkan lagi, pulihkan `sending` yang lewat lease 5 menit, kirim langsung yang sudah jatuh tempo, antrekan yang belum diantrekan pada `send_at` sekarang.
- `deliver()`: klaim bersyarat `pending -> sending`, kirim dengan kunci Resend `reminder:id:send_at`, tandai `sent`. Gagal: `pending` lagi dengan `attempts+1` lalu error dilempar (queue mengulang); percobaan ke-5 jadi `failed`.
- Jam, queue, dan pengirim email adalah parameter (`ReminderDeps`), jadi semua test memakai jam palsu dan tiruan (brief Fase 4).
- Pengingat jadwal: satu per kemunculan; slot yang sudah diisi memakai jam dan judul item pengisinya. Akun yang diarsipkan tidak mendapat pengingat.
- Preset offset di UI: tepat waktu, 30 menit, 1 jam, 2 jam, H-1, H-3.

**Alasan.** Mengikuti desain yang sudah disetujui. Semua test wajib D-007 ada di `tests/reminders.test.ts`; uji mutasi (syarat `status = 'pending'` dihapus sementara) membuat 3 test gagal, jadi test-nya benar-benar menjaga.

**Catatan dari dokumentasi Vercel.** Pesan push dikirim kembali ke deployment yang mengirimnya. Pengingat yang diantrekan sebelum deploy baru dijalankan oleh kode lama, dan berhenti jika deployment lama dihapus; penyapu tetap mengirimnya (D-005).

---

## D-030 Kabel pengingat: Resend lewat fetch, queue hanya di Vercel, satu route untuk cron dan penyapu
Status: Usulan

**Konteks.** Fase 4 Langkah 2 menyambungkan mesin pengingat (D-029) ke Resend, Vercel Queues, dan penjadwal Vercel. Dokumentasi resmi dibaca 23 Nov 2026: Vercel Cron Jobs (berlabel *legacy*, digantikan Schedules), Vercel Schedules (Beta), Resend send-email, idempotency-keys, dan errors.

**Pilihan.**
- **Resend lewat `fetch`** (`src/server/mailer.ts`), tanpa SDK: satu POST ke `https://api.resend.com/emails` dengan header `Idempotency-Key`. Respons **409 `invalid_idempotent_request`** (kunci sama, isi berbeda, misalnya judul diubah di antara dua percobaan) dianggap sudah terkirim, supaya pengingat yang sudah sampai tidak berakhir "Gagal". Nama field JSON error tidak didokumentasikan, jadi yang dicari adalah teks nama error di isi respons. Diuji langsung ke Resend 23 Nov 2026 (alamat uji `delivered@resend.dev`): kunci dan isi sama mengembalikan ID email yang sama tanpa kirim ulang; kunci sama dengan isi berbeda dijawab `409 {"message", "name": "invalid_idempotent_request", "statusCode": 409}`. Tanpa `RESEND_API_KEY`, pengiriman gagal dengan pesan yang jelas, tidak pura-pura terkirim.
- **Semua kode queue di `src/server/reminder-jobs.ts`** (D-010): `send()` ke topik `reminders` dengan delay, retensi, dan kunci idempotency dari D-006. Konsumen `src/app/api/queues/reminders/route.ts` memakai `handleCallback`, dengan backoff 10 detik sampai 5 menit dan berhenti setelah 6 pengiriman.
- **Queue hanya aktif di Vercel** (`process.env.VERCEL`). Di laptop tidak ada emulator, jadi pengiriman ke queue dilewati dan pengingat dikirim oleh route cron saat jatuh tempo. Ditandai *shortcut* di kode; dicek ulang di Fase 7.
- **Satu route `/api/cron/reconcile`** (GET, `Authorization: Bearer <CRON_SECRET>`, dibandingkan *constant-time*) dipanggil oleh Cron Job harian `0 1 * * *` (08.00 WIB) **dan** Schedule `*/15 * * * *` (penyapu), sesuai D-009.
- Setiap aksi yang mengubah item, jadwal, atau akun menjalankan `reconcile()` untuk pengguna itu lewat `after()` dari Next.js, yaitu setelah respons terkirim, sehingga pengguna tidak menunggu dan kegagalannya tidak menggagalkan aksi.
- `RESEND_API_KEY` dan `CRON_SECRET` wajib di production; `EMAIL_FROM` bawaan `Montenku <onboarding@resend.dev>`.

**Belum terverifikasi sampai deploy (Fase 7).** Kunci `functions` di `vercel.json` memakai path `src/app/...` (contoh di dokumentasi tanpa folder `src`), dan pengiriman queue sungguhan. Keduanya tidak bisa diuji tanpa proyek Vercel.

**Tambahan dari uji Langkah 3 (23 Nov 2026).** Kunci dari permintaan yang **ditolak** Resend (422, misalnya alamat `example.com`) tidak diingat: percobaan ulang dengan kunci sama dan isi berbeda dijawab 200. Jadi "Kirim ulang" untuk pengingat gagal tetap memakai kunci `reminder:id:send_at` yang sama tanpa risiko 409. Pesan error disimpan ringkas (`Resend 422 validation_error: ...`), bukan JSON mentah, karena ditampilkan ke pengguna.

---

## D-031 Panel pengingat di halaman item dan editor jadwal
Status: Usulan

**Konteks.** Fase 4 Langkah 3: pengguna perlu mengatur pengingat dan melihat statusnya. Jawaban pengguna: tambahkan tombol "Kirim ulang" untuk pengingat yang gagal.

**Pilihan.**
- Satu komponen server `src/app/(app)/reminder-panel.tsx` dipakai di halaman item (`/konten/[id]`) dan editor jadwal (`/jadwal?ubah=`). Setiap tombol adalah form kecil ke Server Action (`src/server/actions/reminders.ts`), tanpa state di klien.
- Halaman item: satu baris per offset, dengan jam kirim dalam zona akun dan status (Terjadwal, Sedang dikirim, Terkirim, Dibatalkan, Gagal, atau Lewat jika waktu posting sudah lewat sebelum baris dibuat). Pengingat gagal menampilkan pesan error terakhir dan "Kirim ulang".
- Editor jadwal: daftar offset saja (pengingat dibuat per kemunculan dalam 48 jam, D-005), ditambah daftar kemunculan yang gagal, masing-masing dengan "Kirim ulang".
- "Kirim ulang" mengembalikan baris `failed` ke `pending` dengan `attempts` 0, lalu langsung menjalankan `reconcile()` (ditunggu, bukan `after()`), supaya status baru terlihat setelah halaman dimuat. Hanya baris milik pengguna yang berstatus `failed` yang bisa diulang.
- Tambah dan Hapus menjalankan `reconcile()` lewat `after()` seperti aksi lain (D-030). Pilihan offset di form hanya preset yang belum dipakai.

**Alasan.** Mengikuti pola yang sudah ada (Server Action, form tidak terkontrol, ownership dicek di DAL). Diuji di browser dengan Resend sungguhan: pengingat gagal 5 kali karena alamat `example.com`, alamat diganti ke `delivered@resend.dev`, "Kirim ulang" membuatnya Terkirim.
