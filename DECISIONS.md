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

**Batasan sementara.** "Hari ini" dan label zona kolom Minggu memakai Asia/Jakarta untuk semua pengguna (`CALENDAR_HOME_TIMEZONE`). Diganti dengan `user_settings.timezone` saat Pengaturan dibuat di Fase 5. **Selesai di D-032.**

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

---

## D-032 Pengaturan: email, jam senyap, dan zona waktu pengguna
Status: Usulan

**Konteks.** Fase 5 Langkah 1. Brief: preferensi email dan jam senyap opsional. Fase 5 dibagi tiga langkah: (1) Pengaturan, (2) dashboard Hari ini/Minggu ini dan deteksi bentrok, (3) hapus akun. Jawaban pengguna 23 Nov 2026: slot jadwal kosong ikut dihitung untuk bentrok, hapus akun memakai ketik HAPUS ditambah password, dark mode tidak dibuat dulu, dan pengingat yang waktu "sebelum jam senyap"-nya sudah lewat **tetap dikirim saat itu juga**.

**Pilihan.**
- Tabel `user_settings` (satu baris per pengguna, sesuai ERD Fase 0): `email_enabled`, `timezone`, `quiet_start`, `quiet_end`. Baris baru dibuat saat pertama kali disimpan; tanpa baris berarti nilai bawaan (email nyala, Asia/Jakarta, tanpa jam senyap). Database menolak jam senyap setengah terisi atau mulai sama dengan selesai. RLS deny-all seperti tabel lain.
- **Jam senyap (Q2)** dihitung di `applyQuietHours()` (`src/lib/time.ts`) saat `reconcile()` menghitung `send_at`. Jadi `send_at` di tabel tetap satu-satunya sumber kebenaran, dan klaim serta kedua kunci idempotency (D-006, D-007) tidak berubah. Pengingat di jam senyap ditunda ke akhir jam senyap; kalau itu melewati waktu posting, dikirim satu menit sebelum jam senyap mulai. Kalau waktu itu sudah lewat, `reconcile()` mengirimnya saat itu juga (langkah 4 yang sudah ada). Jam senyap memakai zona waktu pengguna, bukan zona akun konten.
- **Email dimatikan** (sejak D-036 hanya berlaku untuk baris kanal email; push punya tombolnya sendiri): pengingat pengguna itu tidak dibuat; yang masih pending dibatalkan, termasuk yang waktu postingnya sudah lewat (kalau tidak, penyapu akan mengirimnya terlambat). Klaim di `deliver()` juga menolak pengguna yang email-nya mati, untuk pesan antrean yang datang sebelum `reconcile()` berjalan. Menyalakan lagi menghidupkan pengingat yang dibatalkan (upsert D-029).
- Menyimpan Pengaturan langsung menjalankan `reconcile()` untuk pengguna itu (ditunggu, bukan `after()`), supaya "Pengaturan tersimpan." berarti pengingat sudah ikut berubah.
- **Zona waktu pengguna** menggantikan `CALENDAR_HOME_TIMEZONE` di kalender ("hari ini" dan label zona Minggu) dan tanggal mulai bawaan jadwal baru (batasan sementara D-025 selesai). Jadwal tiap akun konten tetap memakai zona akunnya (D-022).
- Satu form dengan tombol "Simpan pengaturan", bukan toggle yang langsung tersimpan seperti kesan Figma: tetap berfungsi tanpa JavaScript dan satu klik berarti satu `reconcile()`.
- Nav: "Pengaturan" masuk sidebar dan bottom bar. Bottom bar memakai lebar kolom sesuai label dan teks 13px seperti Figma, jadi lima label muat dari lebar 360px; layar lebih sempit menggeser bar ke samping, bukan memotong label.

**Temuan dan perbaikan (bug sejak Fase 2).** Setelah Server Action selesai, React mereset form ke nilai bawaan, tapi `<select>` kembali ke opsi yang dirender pertama kali (perubahan `defaultValue` berikutnya diabaikan). Akibatnya, setelah konten dipindah ke akun lain dan disimpan, pilihan akun masih menampilkan akun lama, dan simpan berikutnya memindahkannya kembali. Pengaturan zona waktu punya masalah yang sama. Perbaikan: `key` pada `<form>` dari nilai yang ditampilkan, sehingga form dibuat ulang saat nilainya berubah. Diuji di browser untuk form konten dan Pengaturan.

**Alasan.** Mengikuti desain pengingat yang sudah disetujui (satu tabel sumber kebenaran, `reconcile()` sebagai satu-satunya pengubah jadwal). Test: kasus jam senyap (melewati tengah malam, selesai tepat di waktu posting, melewati posting, siang hari, mulai = selesai, DST New York), email mati/nyala, isolasi antar pengguna. Uji mutasi: menghapus salah satu dari dua pemeriksaan "email mati" membuat satu test gagal.

---

## D-033 Dashboard Hari ini / Minggu ini dan deteksi bentrok
Status: Usulan

**Konteks.** Fase 5 Langkah 2. Brief: dashboard "Hari ini" dan "Minggu ini" (apa yang harus diproduksi/diposting per akun, tenggat yang mendekat, yang terlambat) dan peringatan jika dua posting dalam satu akun dijadwalkan di jam yang sama. Figma: frame Dashboard Hari ini (desktop dan mobile); tanda Bentrok juga ada di frame Kalender Bulan, Minggu, dan Daftar.

**Pilihan: bentrok.**
- Dihitung di `findClashes()` (`src/lib/calendar.ts`): dua atau lebih posting **akun yang sama** di **menit yang sama** (Q4). Waktu dibulatkan ke menit, jadi beda detik tetap bentrok. Satu akun punya satu zona, jadi menit yang sama berarti jam dinding yang sama.
- Slot jadwal yang masih kosong ikut dihitung (jawaban pengguna 23 Nov 2026). Slot yang sudah diisi tidak, karena `scheduleSlots()` sudah menggantinya dengan itemnya; slot yang dilewati juga tidak; slot yang digeser dihitung di jam barunya.
- Semua status ikut dihitung, termasuk Terposting, dan item di akun yang diarsipkan (sama dengan yang tampil di kalender).
- Tampil di: dashboard (maksimal 3 peringatan, sisanya "Ada N bentrok lain"), kalender (baris peringatan di atas kalender, label "Bentrok" di hari itu, border kuning tua di chip/kartu), dan strip Minggu ini. Peringatan, bukan error, jadi kuning tua, bukan merah (desain-ui.md).
- *Shortcut:* dashboard mencari bentrok sampai 30 hari ke depan. Bentrok yang lebih jauh baru muncul saat masuk jendela itu (atau terlihat di kalender bulan itu).

**Pilihan: dashboard.**
- "Hari ini" dan "Minggu ini" (Senin sampai Minggu, sama dengan Kalender) memakai zona waktu pengguna (D-032); tiap posting tetap di tanggal dan jam zona akunnya (D-022). Tab disimpan di URL (`?tampilan=minggu`, divalidasi Zod; nilai lain kembali ke Hari ini). Tab Minggu ini tidak punya frame Figma: isinya bagian yang sama, dengan daftar posting dikelompokkan per hari.
- **Terlambat:** tenggat tahap yang lewat dan belum dilewati statusnya, serta waktu posting yang lewat tanpa status Terposting. **Satu baris per konten**: yang paling awal, karena naskah yang terlambat biasanya menjelaskan keterlambatan berikutnya. Posting yang terlewat hari ini muncul di daftar posting **dan** di Terlambat. *Shortcut:* hanya 30 hari ke belakang.
- **Tenggat mendekat:** tenggat tahap yang terbuka dalam 7 hari ke depan, satu per konten, tanpa konten yang sudah terlambat.
- Aturan "tahap selesai" (status sudah melewati tahap itu) dipindah ke `isStageDone()` dan dipakai bersama oleh halaman konten dan dashboard.
- **Pengingat di tiap posting:** yang gagal dulu, lalu yang berikutnya terjadwal, lalu yang terakhir terkirim. Jamnya `send_at` baris itu (setelah jam senyap), di zona akun.
- **Peringatan gagal kirim** tampil sampai 24 jam setelah waktu posting; setelah itu hanya di halaman konten (tombol Kirim ulang ada di sana).
- Setiap query baru memfilter `user_id` dan punya test isolasi.

**Perbaikan yang ditemukan saat uji.** Teks `sr-only` (posisi absolut) di dalam kotak yang bisa digeser keluar dari kotak itu dan membuat seluruh halaman lebih lebar di HP (bilah navigasi bawah ikut melebar). Ini juga terjadi di tampilan Minggu kalender sejak Fase 2. Perbaikan: `relative` pada kotak geser.

**Belum dibuat.** Filter per akun di dashboard (Figma tidak punya); daftar sudah menampilkan akun di setiap baris. Penanda bentrok di halaman detail konten.

---

## D-034 Hapus akun
Status: Usulan

**Konteks.** Fase 5 Langkah 3. Jawaban pengguna 23 Nov 2026: hapus akun memakai ketik HAPUS ditambah kata sandi. Figma: kotak "Hapus akun Montenku" di frame Pengaturan (desktop dan mobile).

**Pilihan.**
- Better Auth `deleteUser` memeriksa kata sandi, menghapus baris `user`, dan mengakhiri cookie sesi. Semua tabel kita ikut terhapus lewat `ON DELETE CASCADE` dari `user` (Fase 0), jadi tidak ada kode hapus per tabel. Pengingat yang masih di antrean tidak menemukan barisnya lagi dan tidak mengirim apa pun (D-006).
- Lewat Server Action `deleteAccountAction`: Zod memeriksa HAPUS (huruf besar; spasi di pinggir dimaafkan) dan kata sandi, lalu rate limit 5 kali per 15 menit per pengguna. Endpoint HTTP `/delete-user` dan `/verify-password` ditutup (`disabledPaths`), jadi tidak ada jalan pintas tanpa HAPUS atau tanpa batas percobaan kata sandi.
- Form terpisah dari "Simpan pengaturan", di bawahnya, dengan border merah seperti Figma. Mengetik HAPUS ditambah kata sandi sudah menjadi konfirmasi, jadi tidak ada dialog tambahan (Figma juga tidak punya). Kolom kata sandi ditambahkan ke desain Figma.
- Setelah berhasil, pengguna diarahkan ke `/masuk?akun=dihapus`, yang menampilkan teks tetap "Akunmu dan semua datanya sudah dihapus."

**Alasan.** Test (`tests/delete-account.test.ts`): kata sandi benar menghapus pengguna dan baris di 11 tabel (setiap tabel memang terisi dulu) tanpa menyentuh pengguna lain; kata sandi salah ditolak dengan pesan Indonesia dan tidak menghapus apa pun; kedua endpoint HTTP mengembalikan 404; skema menolak "hapus" huruf kecil dan kata sandi kosong. Uji klik hanya di Postgres lokal sementara, tidak di Supabase.

---

## D-035 Langganan kalender (.ics) per akun konten
Status: Usulan

**Konteks.** Fase 6 Langkah 1. Fase 6 bersifat opsional di brief. Jawaban pengguna 24 Nov 2026: buat dua-duanya, feed .ics dan Web Push. Isi feed: posting, slot jadwal kosong, **dan** tenggat tahap. Push dan email masing-masing punya tombol sendiri. Fase 6 dibagi tiga langkah: (1) feed .ics, (2) mesin Web Push (skema, pengiriman, test), (3) UI push dan PWA (service worker, manifest, tombol di Pengaturan). Figma tidak punya frame untuk bagian ini.

**Pilihan.**
- **Satu tautan rahasia per akun konten**, `/api/kalender/<token>.ics`. Token berisi 32 byte acak (base64url, 43 karakter), jadi tidak mungkin ditebak. Tautan bisa dibuat, dibuat ulang (tautan lama langsung mati), dan dimatikan dari panel Ubah di halaman Akun konten. Ada juga tombol "Buka di aplikasi kalender" (`webcal://`).
- **Token disimpan apa adanya, tidak di-hash.** Token hanya membuka data yang tersimpan di database yang sama, jadi hash hampir tidak melindungi apa pun. Hash juga membuat tautan tidak bisa ditampilkan lagi tanpa membuat yang baru, dan itu memutus kalender yang sudah berlangganan. Google Calendar memakai pola yang sama ("alamat rahasia" yang bisa dilihat kapan saja). Kolom `feed_token` di `content_accounts` (unik, null berarti mati), jadi tidak perlu tabel baru.
- **Route tanpa sesi.** Satu-satunya query yang tidak memfilter `user_id` adalah pencarian akun berdasarkan token. Setelah itu semua query feed memakai `user_id` dan `account_id` akun tersebut, lewat fungsi DAL yang sudah ada. Token dicek dengan Zod sebelum menyentuh database. Alamat yang salah bentuk, tidak dikenal, sudah dibuat ulang, atau dimatikan semuanya memberi 404 yang sama. Kode kita tidak pernah mencatat token di log, tapi token ada di alamat URL, jadi log akses server (`next dev`, Vercel) tetap menampilkannya. Tidak ada rate limit per IP di feed: layanan kalender memakai IP bersama, dan token tidak bisa ditebak.
- **Isi feed:** posting akun itu, slot kosong jadwal berulang (dihitung dengan `scheduleSlots()` yang sama dengan kalender, sehingga lewati, geser, dan slot terisi sudah benar), dan tenggat tahap yang **belum selesai**. Tenggat yang sudah lewat tahapnya tidak ditampilkan karena tidak ada lagi yang perlu dikerjakan. Akun yang diarsipkan tetap melayani feed-nya, tapi tanpa slot baru (sama dengan kalender).
- **Format ditulis sendiri** di `src/lib/ics.ts`, tanpa library: CRLF, lipat baris per 75 byte (bukan karakter, supaya emoji tidak terpotong), escape `\ ; ,` dan baris baru, UID tetap per acara (item, jadwal + kunci kemunculan, item + tahap) supaya acara tidak berlipat saat sinkron. Semua waktu dalam UTC (`Z`), jadi tidak butuh blok VTIMEZONE. Setiap acara 30 menit.
- Tidak memakai `RRULE` di feed: pengecualian, slot yang digeser, dan slot terisi membuat aturan mentah salah. Kemunculan dihitung satu per satu.
- *Shortcut:* feed hanya mencakup 90 hari ke belakang dan 365 hari ke depan.

**Temuan dan perbaikan (sejak Fase 1).** Postgres sementara untuk test dibuat dengan code page Windows (WIN1252), jadi tidak bisa menyimpan emoji, sementara Supabase memakai UTF-8. `tests/helpers/global-setup.ts` sekarang memakai `--encoding=UTF8`.

**Alasan.** Test (`tests/calendar-feed.test.ts`): format (CRLF, lipat baris dengan emoji, escape, UTC), isi feed (posting, slot, tenggat terbuka, tenggat selesai tidak ikut), UID sama di setiap pengambilan, isolasi (akun lain milik pengguna yang sama dan data pengguna lain tidak ikut, pengguna lain tidak bisa mengganti atau mematikan tautan), tautan lama mati setelah dibuat ulang atau dimatikan, alamat salah bentuk memberi 404, dan tautan mati setelah hapus akun. Uji mutasi: menghapus filter akun pada tenggat membuat test gagal.

**Belum terverifikasi sampai deploy (Fase 7).** Berlangganan langsung dari Google Calendar, karena Google tidak bisa membaca `localhost`.

---

## D-036 Pengingat per kanal: email dan Web Push
Status: Usulan

**Konteks.** Fase 6 Langkah 2. Jawaban pengguna 24 Nov 2026: email dan push masing-masing punya tombol sendiri (push per perangkat), dan satu pengingat dikirim ke setiap kanal yang menyala, masing-masing tepat satu kali. Desain lama (D-006, D-032) punya satu status per (pengaturan, kemunculan), dan "email mati" membatalkan semua pengingat. Keduanya bertentangan dengan jawaban itu.

**Pilihan.**
- **Satu baris per kanal.** `reminders` mendapat kolom `channel` (`email` | `push`, bawaan `email` untuk baris lama), dan kunci idempotency database menjadi (pengaturan, kemunculan, kanal). Setiap baris punya klaim, status, percobaan, dan tombol "Kirim ulang" sendiri, jadi seluruh jaminan D-006 dan D-007 berlaku per kanal tanpa mesin baru.
- **Kanal menyala:** email kalau `email_enabled` (D-032); push kalau pengguna punya minimal satu perangkat di tabel `push_subscriptions`. `reconcile()` membuat baris untuk setiap kanal yang menyala. Satu aturan SQL ("kanal baris ini mati") dipakai di dua tempat: langkah pembatalan (termasuk yang sudah lewat waktunya) dan klaim di `deliver()`. Mematikan email tidak lagi menyentuh push, dan melepas perangkat terakhir tidak menyentuh email.
- **Satu baris push dikirim ke semua perangkat pengguna.** Baris dianggap terkirim begitu **satu** perangkat menerima, jadi pengiriman ulang tidak pernah mengenai perangkat yang sudah menerima. Baris hanya diulang kalau **tidak ada** perangkat yang menerima. Perangkat yang dilaporkan hilang oleh layanan push (404/410) dihapus. Kalau tidak ada perangkat tersisa, baris dibatalkan ("Tidak ada perangkat yang aktif"), bukan gagal. *Konsekuensi:* kalau satu dari dua perangkat sedang bermasalah, perangkat itu tidak menerima pengingat tersebut. Ini dipilih karena brief mengutamakan "tidak pernah terkirim ganda".
- **Celah ganda yang tersisa:** crash setelah layanan push menerima tapi sebelum baris ditandai `sent`. Email punya kunci idempotency Resend untuk celah ini, push tidak. Celah ini dipersempit dengan header `Topic` (id baris tanpa tanda hubung, tepat 32 karakter): layanan push hanya menyimpan pesan terbaru per topic yang belum terkirim. Payload juga membawa `tag` per pengingat. Service worker (Langkah 3) akan memakainya, sehingga notifikasi yang masih tampil di layar diganti, bukan ditambah. Notifikasi yang sudah ditutup pengguna tetap bisa muncul lagi.
- **TTL** dibatasi sampai waktu posting (minimal 60 detik): HP yang baru online setelah waktu posting tidak menerima pengingat basi.
- **Satu perangkat milik satu login.** Endpoint unik. Kalau pengguna lain mengaktifkan push di browser yang sama, baris pindah ke pengguna baru, sehingga pengingat login lama berhenti sampai ke browser itu. Melepas perangkat selalu memfilter `user_id`.
- **Library `web-push` 3.6.7**, bukan kriptografi buatan sendiri: protokol Web Push butuh tanda tangan VAPID dan enkripsi payload. Dipilih 3.6.7 (stabil sejak 2024, ada `@types/web-push`), bukan 4.0.0 yang baru rilis 6 Nov 2026. Kunci VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) boleh kosong di laptop, sehingga pengingat push tercatat gagal seperti `RESEND_API_KEY` yang kosong, dan wajib diisi di production. Error dari layanan push tidak pernah mencantumkan endpoint.

**Alasan.** Test (`tests/push-reminders.test.ts`): dua kanal menghasilkan dua baris dan masing-masing terkirim sekali; tanpa perangkat hanya ada email; email mati tetap mengirim push lewat konsumen antrean; isi push (judul, jam di zona akun, tautan, tag, TTL, topic); pesan push ganda terkirim sekali; satu dari dua perangkat gagal tetap terkirim dan tidak diulang; semua perangkat gagal diulang lalu terkirim; perangkat 410 dihapus dan baris dibatalkan kalau habis; perangkat terakhir dilepas membatalkan push pending setelah waktu posting, sementara email tetap terkirim; email dimatikan setelah diantrekan tidak diklaim; isolasi perangkat antar pengguna. Uji mutasi: menghapus cek kanal di klaim, menghapus cek kanal di pembatalan, memakai aturan email lama di klaim, dan mengulang push saat sebagian perangkat gagal, masing-masing membuat test gagal. Test hapus akun sekarang mencakup 12 tabel.

**Belum terverifikasi.** Pengiriman push sungguhan ke browser: butuh service worker dan tombol berlangganan (Langkah 3) serta kunci VAPID.

---

## D-037 Notifikasi push di perangkat dan PWA
Status: Usulan

**Konteks.** Fase 6 Langkah 3: tombol push per perangkat (jawaban pengguna 24 Nov 2026), service worker, dan manifest supaya Montenku bisa dipasang ke layar utama. iPhone dan iPad hanya mengizinkan push untuk web app yang sudah dipasang ke Layar Utama (iOS 16.4+). Figma hanya punya baris "Email pengingat" di Pengaturan, jadi bagian push meniru gayanya.

**Pilihan.**
- **Satu tombol "Notifikasi push" per perangkat** di Pengaturan, langsung tersimpan tanpa tombol Simpan. "Menyala" berarti browser ini punya langganan **dan** server menyimpannya untuk pengguna ini (langganan di browser bisa milik login lain, D-036). Izin notifikasi baru diminta saat tombol diklik. Kalau tidak bisa, keterangannya jelas: browser tidak mendukung, iPhone yang belum dipasang ke Layar Utama, izin diblokir, atau kunci VAPID belum diisi di server. Langganan yang dibuat dengan kunci server lama dibuang lalu dibuat ulang.
- **Menyalakan dan mematikan menjalankan `reconcile()` dan menunggunya**, seperti menyimpan Pengaturan. Akibatnya, menyalakan push langsung mengirim pengingat yang waktu kirimnya sudah lewat selama waktu posting masih di depan (aturan lama D-005), sehingga ini cara tercepat menguji notifikasi. Mematikan perangkat terakhir membatalkan push yang masih pending.
- **Cegah SSRF:** server akan mengirim POST ke alamat `endpoint` dari browser, jadi hanya layanan push resmi yang diterima (`https`, port bawaan, tanpa `user:pass@`): `fcm.googleapis.com` (Chrome dan browser Chromium lain), `updates.push.services.mozilla.com` (Firefox), subdomain `push.apple.com` (Safari), dan subdomain `notify.windows.com` (Edge). Daftar ini dicek dari dokumentasi masing-masing vendor pada 24 Nov 2026. Yang ditolak hanya mencatat nama host di log, tidak pernah endpoint lengkapnya.
- **Keluar** mengirim endpoint perangkat ini, sehingga barisnya dihapus (difilter `user_id`) dan browser bersama berhenti menerima pengingat pengguna itu. Tanpa JavaScript, tanpa push, atau dengan sesi yang sudah kedaluwarsa, keluar tetap berfungsi, tapi perangkat itu tetap berlangganan sampai pengguna berikutnya menyalakan push di sana (D-036) atau layanan push melaporkannya hilang.
- **Service worker** (`public/sw.js`): hanya menampilkan notifikasi dan membuka tautannya, tanpa cache offline. Setiap push selalu berakhir dengan `showNotification` di dalam `waitUntil` (payload rusak tetap memunculkan notifikasi umum). `tag` dari payload membuat notifikasi yang masih tampil diganti, bukan ditambah. Klik hanya membuka halaman di origin Montenku. Header `/sw.js` mengikuti panduan PWA Next.js (tanpa cache, CSP `'self'`).
- **Manifest** lewat `src/app/manifest.ts`, plus ikon PNG sementara (huruf M di warna Montenku) sampai ada logo asli. Semua berkas ini punya ekstensi, jadi `proxy.ts` tidak mengarahkannya ke /masuk (ada test-nya).
- **Label kanal:** panel pengingat menampilkan satu status per kanal ("Email: Terkirim", "Push: Gagal") dan tombol "Kirim ulang" per baris, sehingga push yang gagal tidak tersembunyi di balik email yang terkirim. Keterangan di panel menyebut kanal mana yang mati. Peringatan gagal di dashboard menyebut kanalnya.
- Kunci publik VAPID dikirim ke browser lewat props halaman Pengaturan. Kunci privat tidak pernah keluar dari server.

**Alasan.** Test: daftar host diterima dan ditolak (host lain, `fcm.googleapis.com.evil.com`, host di query string, http, port, kredensial, IP, localhost), skema langganan, berkas PWA tidak dihalangi proxy sementara halaman tetap dijaga, serta status, ringkasan, dan peringatan gagal yang menyebut kanalnya.

**Belum terverifikasi.** Pengiriman push sungguhan dan penggantian lewat `tag`: browser di panel pratinjau memblokir izin notifikasi dan service worker, jadi harus dicoba di Chrome pengguna. Pemasangan di iPhone butuh HTTPS (Fase 7).

---

## D-038 E2E Playwright, CI GitHub Actions, dan keep-alive
Status: Usulan

**Konteks.** Fase 7 Langkah 1. Fase 7 dibagi tiga langkah: (1) E2E, CI, dan keep-alive, (2) README, (3) push ke GitHub, deploy ke Vercel, akun demo, dan uji langsung. Jawaban pengguna 24 Nov 2026: repo `github.com/Achmad-Mahrusiy/montenku`, situs live memakai project Supabase yang sama, dan Playwright dijalankan di laptop dan di CI.

**Pilihan.**
- **E2E Playwright** (`e2e/`, `npm run test:e2e`) memakai app hasil build (`next start`), sama di laptop dan di CI. Dua test:
  - Alur utama brief: daftar → dua akun konten (Jakarta dan Tokyo) → jadwal berulang → kalender gabungan dan per akun → konten di akun Tokyo dengan pengingat "2 jam sebelum" (tampil 17:00 di zona akun).
  - Isolasi: pengguna kedua di browser terpisah membuka URL konten dan akun konten milik pengguna pertama, dan hasilnya "tidak ditemukan".
- **Database E2E** adalah Postgres sementara (`e2e/start-db.mjs`) yang dijalankan sebagai `webServer` pertama. Playwright 1.65 menjalankan `webServer` sebelum `globalSetup` (dicek di kode sumbernya), jadi database tidak bisa dijalankan di `globalSetup`. Database baru menjawab di port kesiapan setelah semua migrasi selesai.
- **E2E tidak pernah menyentuh layanan luar.** Semua kunci (Supabase, Upstash, Resend, VAPID, cron) diisi kosong atau dummy di env `webServer`, karena Next akan mengisi kunci yang hilang dari `.env`. Port E2E khusus (3200), dan server yang sudah berjalan tidak dipakai ulang. Test pertama mengecek pengguna barunya benar-benar ada di database sementara, sehingga override yang rusak langsung ketahuan.
- **Tanggal:** jadwal memilih ketujuh hari, supaya bulan ini selalu punya slot kosong, apa pun tanggalnya. Konten memakai tanggal tetap di 2031, sehingga test tidak bergantung pada hari dijalankan (CI berjalan dalam UTC). Semua test unit juga lulus dengan `TZ=UTC`.
- **Email dan "tepat satu kali"** tetap diuji di Vitest dengan jam palsu (D-005 sampai D-007, D-036), tidak lewat E2E. Tidak ada saklar email palsu di kode produksi. Pengiriman sungguhan dicek di Langkah 3.
- **CI** (`.github/workflows/ci.yml`) berjalan pada push ke `main` dan setiap pull request: typecheck, lint, Vitest (Postgres sungguhan lewat embedded-postgres, biner Linux sudah ada di lockfile), build, lalu E2E. Laporan Playwright diunggah kalau gagal. Hanya memakai env dummy dan izin `contents: read`. Versi action (`checkout`, `setup-node`, `upload-artifact` v7) dicek di halaman rilis masing-masing.
- **Keep-alive** (`.github/workflows/keep-alive.yml`) memanggil `/api/health` sekali sehari (Supabase Free pause setelah 7 hari tanpa aktivitas), plus tombol jalankan manual. `curl --fail` membuat workflow gagal kalau jawabannya bukan 2xx. Workflow dilewati sampai variabel repo `HEALTH_URL` diisi (Langkah 3). GitHub mematikan workflow terjadwal di repo publik setelah 60 hari tanpa aktivitas repo; aktifkan lagi di tab Actions kalau itu terjadi.
- Folder data Postgres sisa penghentian paksa (sekitar 40 MB per folder) dihapus otomatis saat test berikutnya mulai, baik di Vitest maupun E2E.

**Belum terverifikasi.** Kedua workflow baru berjalan setelah push pertama ke GitHub. E2E dan semua langkah CI sudah dijalankan di laptop.

---

## D-039 Celah keamanan di dependensi: `overrides`, bukan `npm audit fix --force`
Status: Usulan

**Konteks.** 24 Nov 2026: `npm install` melaporkan 12 celah (9 moderate, 3 high). Semuanya ada di salinan paket **di dalam** dependensi lain, tidak ada yang di kode Montenku atau dependensi langsungnya. Saran `npm audit fix --force` justru akan menurunkan `drizzle-kit`, `@vercel/queue`, dan `shadcn` ke versi yang sangat lama (perubahan besar).

**Pilihan.** `overrides` di `package.json` memaksa salinan bersarang ke versi yang sudah ditambal, memakai versi yang memang sudah ada di proyek:
- `zod` 4.1.11 → 4.6.7 di dalam `@vercel/cli-config` (dipakai `@vercel/oidc`, bagian dari Vercel Queues). Celah high: memori habis saat memvalidasi koleksi yang sangat besar. Major tetap v4, sama dengan zod milik Montenku.
- `minimatch` 10.2.6 → 11.0.9 di dalam `@vercel/queue` dan `@ts-morph/common` (dipakai CLI `shadcn`). Celah moderate: DoS lewat pola glob.
- `esbuild` 0.18.20 → 0.25.12 di dalam `@esbuild-kit/core-utils` (dipakai `drizzle-kit` untuk membaca `drizzle.config.ts`). Celah moderate di server dev esbuild, yang sebenarnya tidak dipakai drizzle-kit.

**Alasan.** Hasilnya `npm audit` melaporkan 0 celah tanpa menurunkan versi apa pun. Dicek setelahnya: `drizzle-kit generate` tetap berjalan ("No schema changes"), typecheck, lint, 179 test, build, dan E2E lulus, dan biner Linux esbuild 0.25.12 ada di lockfile untuk CI. Hapus satu entri `overrides` begitu paket induknya sendiri sudah memakai versi yang ditambal.

## D-040 Navbar di atas untuk semua ukuran layar
Status: Disetujui (prototype Figma "Prototype v2: navbar atas", 25 Nov 2026)

**Konteks.** Versi pertama memakai sidebar kiri di layar ≥1024px dan bar bawah di layar lebih sempit. Di jendela laptop yang dikecilkan, navigasi tiba-tiba pindah ke bawah. Pemilik produk meminta navbar di atas.

**Pilihan.** Satu header di atas untuk semua layar, menempel saat halaman digulir (`sticky`):
- **Layar ≥1024px:** logo, lima menu sejajar (yang aktif ditandai stabilo kuning), dan Keluar di kanan.
- **Layar lebih sempit:** logo dan tombol ☰. Tombol ini membuka daftar menu dan Keluar tepat di bawah header. Menu tertutup lagi saat sebuah halaman dipilih, tombol ✕ ditekan, atau Esc ditekan.

Daftar akun konten berwarna yang dulu ada di sidebar dihapus. Akun tetap terlihat di halaman Akun konten, di filter kalender, dan di setiap konten.

**Alasan.** Satu pola navigasi di semua ukuran, jadi tidak ada lompatan dari kiri ke bawah. Header yang menempel membuat menu tetap terjangkau setelah menggulir, seperti bar bawah sebelumnya. Lima label tidak muat sejajar di lebar 375px, jadi HP memakai tombol menu, bukan label yang dipotong atau bar yang digeser.

## D-041 Animasi (GSAP + ScrollTrigger, Motion, Lenis) dan kotak kalender untuk akun zona lain
Status: Disetujui (25 Nov 2026)

**Konteks.** Pemilik produk merasa website "kaku", lalu meminta GSAP + ScrollTrigger, Motion untuk animasi masuk dan hover kartu, serta Lenis untuk smooth scroll. Saat review semua halaman juga ditemukan satu bug: di kalender Bulan, kalender Minggu, dan strip "Minggu ini" di dashboard, konten dari akun di zona lain (`20:00 GMT+9`) hanya menyisakan 1–2 px untuk judulnya.

**Pilihan.** Setiap library punya satu tugas:
- **Lenis 1.3.27** (`src/app/motion-root.tsx`, dipasang di root layout): smooth scroll di seluruh website. Lenis digerakkan oleh ticker GSAP dan memanggil `ScrollTrigger.update` di setiap frame, jadi posisi scroll keduanya selalu sama. `anchors` membuat link `#hari-...` ikut meluncur halus. `allowNestedScroll` dan `data-lenis-prevent` membiarkan menu HP dan tabel lebar tetap bisa di-scroll sendiri.
- **Motion 14.12.0**: kartu muncul naik 16 px berurutan (jeda 60 ms) dan terangkat 3 px saat disentuh kursor. Kartunya: posting dan peringatan di dashboard, daftar kalender, kartu jadwal, dan kartu akun konten. Preset ada di `src/lib/motion.ts`, dipakai lewat `motion/react-client` sehingga halaman tetap Server Component.
- **GSAP 3.15.1 + ScrollTrigger** (`src/app/(app)/scroll-reveal.tsx`): blok bertanda `data-reveal` yang awalnya ada di bawah layar naik pelan saat digulir ke dalam layar, termasuk blok yang baru muncul belakangan (halaman yang dimuat bertahap atau panel yang dibuka), karena dipantau dengan MutationObserver. Blok-bloknya: strip "Minggu ini", hari di kalender Daftar, kemunculan jadwal, panel pengingat dan catatan, bagian form konten, dan Pengaturan. Blok yang sudah terlihat saat halaman dimuat tidak disembunyikan, jadi tidak ada yang berkedip. Animasinya hanya memakai `opacity`, bukan `visibility`, jadi pengguna keyboard tetap bisa Tab ke dalamnya.
- **CSS** (`globals.css`): halaman memudar masuk lewat `template.tsx`. Blok Masuk/Daftar naik bergantian. Peringatan dan pemberitahuan muncul pelan, dan panel menu HP turun. Transisi warna pada menu dan tab, tombol yang mengecil saat ditekan, ikon ☰ yang berputar, dan kerangka "memuat" yang berdenyut juga dibuat dengan CSS.
- **Kurangi gerakan:** jika perangkat meminta "kurangi gerakan", Lenis tidak dinyalakan, GSAP tidak berjalan (`matchMedia`), Motion hanya memudar tanpa bergerak (`reducedMotion="user"`), dan semua animasi CSS mati.
- **Kotak kalender dengan label zona** dibuat dua baris: jam dan zona di atas, judul di bawah. Label zona tetap terlihat (D-022).

**Alasan.**
- Versi paket dikunci, dan setiap versi sudah dirilis minimal dua minggu sebelumnya. GSAP beserta plugin-pluginnya kini gratis.
- Tambahan JavaScript kira-kira 60 KB gzip. Ini diterima demi rasa yang diminta, tapi hanya untuk halaman aplikasi, bukan API.
- Animasi gerak hanya berjalan saat elemen muncul. Animasi halaman hanya memakai opacity, jadi elemen `fixed` tidak pernah bergeser.
