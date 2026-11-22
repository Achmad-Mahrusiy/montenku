# DECISIONS.md

Format per keputusan: **Konteks → Opsi → Pilihan → Alasan**. Status `Usulan` berarti menunggu persetujuan.
Diagram dan ERD ada di [docs/fase-0-arsitektur.md](docs/fase-0-arsitektur.md).

---

## D-001 Library zona waktu: Temporal (`temporal-polyfill`)
Status: Usulan

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
Status: Usulan

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
Status: Usulan

**Konteks.** Dukungan TZID di `rrule` bergantung pada Intl dan zona host, dan ada laporan bug (hasil `RRule` vs `RRuleSet` tidak konsisten, regresi `after()` dengan TZID).

**Opsi.** Memakai TZID bawaan `rrule`, atau memakai `rrule` hanya untuk aritmetika kalender.

**Pilihan.** `rrule` menerima `dtstart` berupa komponen jam dinding yang dibungkus `Date.UTC(...)`, tanpa TZID. Konversi ke instant dilakukan oleh Temporal (D-001).

**Alasan.**
- `rrule` hanya mengerjakan bagian yang memang ia kuasai (pola kalender), sedangkan Temporal mengurus zona waktu.
- Hasilnya tidak bergantung pada TZ server. CI tetap menjalankan test dengan beberapa nilai `TZ` untuk membuktikannya.

---

## D-004 `occurrence_key` = jam dinding asli
Status: Usulan

**Konteks.** Pengecualian, item tertaut, dan pengingat harus menunjuk ke kemunculan tertentu secara stabil.

**Opsi.** Instant UTC, nomor urut kemunculan, atau jam dinding lokal.

**Pilihan.** String jam dinding `YYYY-MM-DDTHH:mm` dari jadwal aslinya (sebelum digeser).

**Alasan.**
- Instant berubah saat zona akun diganti, sehingga pengecualian akan lepas.
- Nomor urut berubah saat aturan diedit.
- Jam dinding tetap sama di kedua kasus tersebut, dan mudah dibaca saat debugging.

---

## D-005 Pengisian pengingat: satu fungsi `reconcile()`, jendela 48 jam
Status: Usulan

**Konteks.** Delay maksimum Vercel Queues 7 hari, dan delay yang melebihi retensi pesan ditolak (retensi default 24 jam). Cron Vercel di Hobby berjalan minimal 1x sehari dengan presisi ±59 menit, dan bisa terlewat atau berjalan ganda.

**Opsi.** Jendela 7 hari (sesuai batas maksimum) atau jendela pendek.

**Pilihan.**
- Jendela **48 jam**, `retentionSeconds = delay + 24 jam`.
- Cron harian dan penyapu memanggil **fungsi `reconcile()` yang sama**: materialisasi baris 48 jam ke depan, enqueue baris yang belum di-enqueue untuk `send_at` saat ini, dan pulihkan baris `sending` yang macet.
- Saat item atau aturan diubah, baris yang jatuh tempo dalam jendela langsung di-enqueue setelah transaksi commit, tanpa menunggu cron.

**Alasan.**
- Jendela 48 jam berarti satu kali cron yang terlewat tidak membuat pengingat hilang.
- Pesan yang tidak bisa dibatalkan (D-006) jadi lebih sedikit menumpuk.
- Masih ada ruang retry sebelum pesan kedaluwarsa.
- Satu jalur kode yang idempotent lebih mudah dites daripada tiga job terpisah.
- Kolom `enqueued_send_at` membuat tabel `reminders` sekaligus berperan sebagai outbox: jika enqueue setelah commit gagal, `reconcile()` berikutnya akan mengulanginya.

---

## D-006 Pembatalan dan penjadwalan ulang lewat DB, dengan dua kunci idempotency
Status: Usulan

**Konteks.** Vercel Queues tidak punya API untuk membatalkan pesan yang sudah dikirim. Pengiriman pesannya at-least-once.

**Pilihan.**
- Membatalkan = `status='cancelled'`. Menggeser = mengubah `send_at` lalu enqueue pesan baru.
- Konsumen selalu membaca ulang baris dan berhenti (ack) jika baris tidak ada, bukan `pending`, atau `send_at`-nya tidak sama dengan isi pesan.
- Kunci unik DB: `(reminder_setting_id, occurrence_key)`. Kunci idempotency queue: `id:send_at`.

**Alasan.**
- DB menjadi satu-satunya sumber kebenaran, sedangkan pesan hanya "ketukan pintu".
- Dedup queue berlaku selama retensi pesan. Kalau kuncinya hanya `id`, pesan untuk jadwal yang digeser akan dianggap duplikat dan dibuang. Itulah alasan ada dua kunci.

---

## D-007 Tambah status `sending` dengan lease (menyimpang dari brief)
Status: **Usulan, perlu persetujuanmu**

**Konteks.** Brief meminta `UPDATE ... WHERE status='pending'` lalu kirim email jika satu baris berubah. Jika update itu langsung ke `sent` lalu fungsi crash atau Resend gagal, pengingat dianggap terkirim padahal tidak, dan hilang tanpa jejak.

**Opsi.**
1. Klaim langsung ke `sent`: tidak pernah ganda, tapi bisa hilang.
2. Kirim dulu, baru tandai: tidak hilang, tapi bisa ganda.
3. Klaim ke `sending` + `claimed_at` (lease), kirim dengan `Idempotency-Key` Resend, lalu tandai `sent`.

**Pilihan.** Opsi 3. Status menjadi `pending | sending | sent | cancelled | failed`.
- Resend gagal: kembali ke `pending`, `attempts+1`, lalu lempar error agar queue mengulang dengan backoff.
- Setelah 5 percobaan: `failed`, ditampilkan di UI.
- Konsumen diset `maxDeliveries` eksplisit karena defaultnya tidak terbatas dan Vercel Queues tidak punya dead-letter queue.
- Penyapu mengembalikan baris `sending` yang lebih tua dari 5 menit ke `pending`.

**Alasan.**
- UPDATE bersyarat tetap menjamin hanya satu pekerja yang mengirim.
- Jika crash terjadi setelah email terkirim tapi sebelum status `sent`, pengiriman ulang memakai kunci Resend yang sama (`reminder:id:send_at`, berlaku 24 jam), sehingga Resend tidak mengirim dua kali.
- Hasilnya: tidak hilang dan tidak ganda.

---

## D-008 Isolasi data dijaga DAL; RLS hanya menutup Data API
Status: Usulan

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

## D-009 Lokasi penyapu (sweeper)
Status: **Usulan, perlu pilihanmu**

**Konteks.** Cron Vercel Hobby minimal sekali sehari, jadi tidak bisa dipakai untuk penyapu tiap 15 menit.

**Opsi.**
- A. Vercel Schedules: menurut dokumentasi, Hobby bisa minimal tiap 15 menit dengan jitter, kuota 5.000 run per periode (15 menit ≈ 2.900 run/bulan). Ini fitur baru dan hubungannya dengan Cron Jobs belum jelas di dokumentasi.
- B. GitHub Actions `*/15`: gratis, tapi GitHub sendiri menyebut jadwalnya bisa telat atau terlewat saat beban tinggi.

**Pilihan.** A jika tersedia di akunmu saat Fase 4; jika tidak, B. Keduanya memanggil `/api/cron/reconcile` dengan `CRON_SECRET`.

**Alasan.** Penyapu hanya jaring pengaman. Ketepatan waktu tetap dari pesan tertunda di queue, jadi keterlambatan beberapa menit di penyapu bisa diterima.

---

## D-010 Vercel Queues di balik satu adapter
Status: Usulan

**Konteks.** Dokumentasi menyebut Queues "Beta on all plans". Konfigurasinya memakai `experimentalTriggers` dengan `type: "queue/v2beta"`. Paketnya `@vercel/queue` (`send`, `handleCallback`).

**Pilihan.** Pakai Vercel Queues (tidak perlu QStash). Semua pemanggilan queue ada di `src/server/queue.ts`, dan test me-mock modul ini.

**Alasan.** API Beta bisa berubah. Dengan satu adapter, perubahan API atau pindah ke QStash hanya menyentuh satu file. Ketersediaan di akunmu tetap dicek di Fase 1.

---

## D-011 Penamaan: `content_accounts`, bukan `accounts`
Status: Usulan

**Konteks.** Better Auth sudah memakai tabel `account` untuk akun login.

**Pilihan.** Akun konten = `content_accounts` di DB dan `ContentAccount` di kode. UI tetap menulis "Akun konten".

**Alasan.** Menghindari salah join dan kebingungan saat membaca kode.

---

## D-012 Keep-alive berlapis
Status: Usulan

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
| Q5 | D-007 (status `sending`) dan D-009 (lokasi penyapu) | Setujui D-007; D-009 pilih A, fallback ke B. |

Asumsi lain (koreksi jika salah):
- Catatan wajib punya akun konten; tautan ke item opsional.
- Tag disimpan sebagai `text[]` di item, tanpa tabel tag.
- Pengingat yang waktunya sudah lewat saat dibuat langsung dikirim.
