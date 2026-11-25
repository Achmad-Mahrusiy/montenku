# Deploy Montenku ke Vercel

Panduan deploy pertama (Fase 7 Langkah 3). Langkah yang memakai akun dan rahasia dikerjakan sendiri di browser. Nilai rahasia disalin dari `.env` di laptop dan tidak pernah ditulis di file lain.

Live site memakai **project Supabase yang sama** dengan laptop. Migrasi sudah dijalankan dari laptop, jadi Vercel tidak perlu menjalankan migrasi.

## 1. Pastikan kode terbaru sudah di GitHub

Commit dan push semua perubahan, termasuk `vercel.json` yang kini berisi `"regions": ["sin1"]`. Vercel selalu membangun dari GitHub, bukan dari laptop.

## 2. Buat akun dan import project

1. Buka https://vercel.com/signup, pilih **Hobby**, lalu masuk dengan **Continue with GitHub**.
2. Di dashboard, klik **Add New… > Project**.
3. Pilih repo `montenku` lalu klik **Import**. Kalau repo tidak muncul, klik **Adjust GitHub App Permissions** dan izinkan repo itu.
4. **Project Name:** `montenku`. Nama ini menjadi alamat `https://montenku.vercel.app`. Kalau nama itu sudah dipakai orang lain, Vercel memberi alamat lain; pakai alamat itu di semua langkah berikut.
5. Framework terdeteksi otomatis sebagai Next.js. Build Command, Output, dan Install tidak perlu diubah.

**Jangan klik Deploy dulu.** Isi environment variables di langkah 3, karena build gagal kalau ada kunci wajib yang kosong (`src/lib/env.ts` mewajibkan semuanya di production).

## 3. Environment variables

Di bagian **Environment Variables** pada halaman import, tambahkan kunci di bawah satu per satu. Lingkungannya cukup **Production**.

| Kunci | Nilai |
|---|---|
| `DATABASE_URL` | Salin dari `.env` (yang port **6543**) |
| `BETTER_AUTH_SECRET` | Rahasia **baru** khusus production. Buat dengan perintah di bawah tabel |
| `BETTER_AUTH_URL` | `https://montenku.vercel.app` (alamat dari langkah 2, tanpa `/` di akhir) |
| `UPSTASH_REDIS_REST_URL` | Salin dari `.env` |
| `UPSTASH_REDIS_REST_TOKEN` | Salin dari `.env` |
| `RESEND_API_KEY` | Salin dari `.env` |
| `CRON_SECRET` | Salin dari `.env` (baris paling bawah) |
| `VAPID_PUBLIC_KEY` | Salin dari `.env` |
| `VAPID_PRIVATE_KEY` | Salin dari `.env` |
| `VAPID_SUBJECT` | Salin dari `.env` |

Perintah untuk membuat `BETTER_AUTH_SECRET` baru (hasilnya langsung ditempel ke Vercel):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Yang tidak perlu diisi:
- `DIRECT_URL`: hanya untuk migrasi dari laptop.
- `EMAIL_FROM`: kosong berarti memakai `onboarding@resend.dev`.

Rahasia yang berbeda dari laptop berarti sesi login di laptop dan di live site tidak saling berlaku. Itu memang disengaja.

## 4. Deploy

1. Klik **Deploy**. Build butuh sekitar 2–3 menit.
2. Buka `https://montenku.vercel.app/api/health`. Hasilnya harus `{"status":"ok"}`. Kalau `{"status":"error"}`, berarti `DATABASE_URL` salah.
3. Di project Vercel, cek:
   - **Settings > Functions:** region **Singapore (sin1)**.
   - **Settings > Cron Jobs:** ada `/api/cron/reconcile` dengan jadwal `0 1 * * *`.
   - Tab **Schedules** (atau **Observability**): ada `reminder-sweeper` tiap 15 menit.

Kalau alamatnya ternyata bukan `montenku.vercel.app`, ubah `BETTER_AUTH_URL` di **Settings > Environment Variables**, lalu **Deployments > ⋯ > Redeploy**. Nilai env baru hanya berlaku setelah redeploy.

## 5. Akun demo

Resend tanpa domain sendiri (test mode) **hanya mengirim email ke alamat pemilik akun Resend**. Jadi daftarkan akun demo dengan email yang sama dengan akun Resend-mu, supaya email pengingat benar-benar sampai.

1. Buka `https://montenku.vercel.app/daftar` dan buat akun.
2. Di **Akun konten**, tambahkan tiga akun:

   | Nama | Platform | Zona waktu |
   |---|---|---|
   | Masak Hemat | Instagram | WIB (Asia/Jakarta) |
   | Jalan Pagi | TikTok | WIB (Asia/Jakarta) |
   | Kode Santai | YouTube | Asia/Tokyo |

3. Di **Jadwal berulang**, buat satu jadwal per akun:
   - **Masak Hemat:** "Upload resep", Selasa dan Jumat, 19:00
   - **Jalan Pagi:** "Rute pagi", Sabtu dan Minggu, 06:30
   - **Kode Santai:** "Tutorial mingguan", Rabu, 20:00
4. Isi beberapa slot lewat tombol **Isi konten**, supaya kalender dan dashboard punya isi.

## 6. Uji pengingat di live site

1. Buka **Pengaturan**, pastikan email **nyala**, lalu nyalakan sakelar **Notifikasi push** dan izinkan notifikasi saat Chrome bertanya.
2. Buat konten baru dengan jam target **sekitar 10 menit dari sekarang**, lalu tambahkan pengingat **Tepat waktu**.
3. Tunggu sampai jamnya. Email dan notifikasi push harus datang hampir bersamaan (lewat Vercel Queues), dan status pengingat di halaman konten berubah menjadi **Terkirim**.
4. Kalau tidak datang dalam 30 menit:
   - Buka **Vercel > project > Logs**, filter `/api/queues/reminders` dan `/api/cron/reconcile`.
   - Salin pesan error-nya untuk diperiksa.

## 7. Keep-alive Supabase

Supabase Free menjeda project setelah seminggu tanpa aktivitas.

1. Di GitHub, buka repo `montenku` > **Settings > Secrets and variables > Actions > Variables > New repository variable**.
2. Isi nama `HEALTH_URL` dan nilai `https://montenku.vercel.app/api/health`.
3. Buka tab **Actions > Keep Supabase awake > Run workflow** untuk mencobanya sekali. Hasilnya harus hijau.

## 8. Kalender `.ics`

1. Di live site, buka **Akun konten > Ubah** pada satu akun, lalu klik **Buat tautan kalender**.
2. Tambahkan ke aplikasi kalender:
   - **Google Calendar (web):** **Other calendars > + > From URL**, tempel tautan `https://…/api/kalender/….ics`. Google memperbarui langganan sendiri, biasanya beberapa jam sekali, tidak langsung.
   - **Apple Calendar dan iPhone:** tombol **Buka di aplikasi kalender** membuka tautan `webcal://` yang langsung menawarkan langganan.

Tautan ini rahasia: siapa pun yang memegangnya bisa melihat jadwal akun itu. Kalau bocor, klik **Buat tautan baru** di panel yang sama; tautan lama langsung berhenti bekerja.
