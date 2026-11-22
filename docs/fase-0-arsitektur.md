# PostingKu — Fase 0: Arsitektur

Status: **draf, menunggu persetujuan**. Belum ada kode. Keputusan teknis dan alasannya ada di [DECISIONS.md](../DECISIONS.md); dokumen ini menjelaskan bentuk sistemnya.

## 1. Gambaran besar

```mermaid
flowchart LR
  B[Browser] -->|HTTPS| P["proxy.ts<br/>cek cookie saja"]
  P --> N["Next.js 16 App Router<br/>RSC + Server Actions + Route Handlers"]
  N --> Z["Zod: validasi input"]
  Z --> DAL["Data-access layer<br/>wajib userId"]
  DAL --> DR["Drizzle + postgres-js<br/>prepare:false"]
  DR -->|"pooler :6543"| DB[("Supabase Postgres<br/>RLS deny-all")]
  N --> BA[Better Auth] --> DR
  N --> RL[Upstash Ratelimit]
  N -->|"send + delaySeconds"| Q[["Vercel Queues<br/>topic: reminders"]]
  Q -->|push| C["Consumer<br/>/api/queues/reminders"]
  C --> DAL
  C --> RS[Resend]
  CR[Vercel Cron harian] --> REC["/api/cron/reconcile"]
  SW["Penyapu tiap 15 mnt<br/>(Vercel Schedules)"] --> REC
  REC --> DAL
  REC --> Q
  GH[GitHub Actions terjadwal] --> H["/api/health"] --> DB
```

Aturan alur:
- **`proxy.ts` hanya mengecek keberadaan cookie** untuk redirect. Sesi yang sebenarnya divalidasi di server lewat `requireUser()` di DAL. Cookie ada belum berarti sesinya sah.
- **Semua akses data lewat DAL.** Kode di luar `src/server/dal/` tidak boleh mengimpor `db` (dijaga aturan lint di Fase 1).
- Mutasi dari UI memakai Server Actions. Endpoint yang dipanggil dari luar (queue, cron, health) memakai Route Handlers.

## 2. ERD

Prinsip:
- **`user_id` ditulis di setiap tabel milik pengguna** (denormalisasi sengaja). DAL cukup menambah `WHERE user_id = $1` tanpa join, jadi filternya sederhana dan sulit terlupa.
- **Foreign key komposit `(account_id, user_id)`** ke `content_accounts(id, user_id)`. Database sendiri menolak item milik pengguna A yang menempel ke akun konten pengguna B.
- Better Auth punya tabel bernama `account` (akun login). Supaya tidak tertukar, **akun konten = `content_accounts`**.
- Waktu absolut disimpan sebagai `timestamptz` (UTC). Waktu "jam dinding" aturan berulang disimpan sebagai `timestamp` tanpa zona, dipasangkan dengan zona waktu akun.

```mermaid
erDiagram
  user ||--o{ session : has
  user ||--o{ account : "login (Better Auth)"
  user ||--|| user_settings : has
  user ||--o{ content_accounts : owns
  content_accounts ||--o{ content_items : has
  content_accounts ||--o{ schedules : has
  content_accounts ||--o{ notes : has
  schedules ||--o{ schedule_exceptions : has
  schedules ||--o{ content_items : "slot diisi item"
  content_items ||--o{ item_stage_deadlines : has
  content_items ||--o{ notes : "tertaut (opsional)"
  content_items ||--o{ reminder_settings : has
  schedules ||--o{ reminder_settings : has
  reminder_settings ||--o{ reminders : "dimaterialisasi jadi"

  user {
    text id PK
    text email
    text name
  }
  user_settings {
    text user_id PK
    bool email_enabled
    text timezone "IANA, default Asia/Jakarta"
    time quiet_start "nullable"
    time quiet_end "nullable"
  }
  content_accounts {
    uuid id PK
    text user_id FK
    text name
    enum platform "tiktok, instagram, youtube"
    text handle
    text color
    text timezone "IANA, default Asia/Jakarta"
    timestamptz archived_at "null = aktif"
  }
  content_items {
    uuid id PK
    text user_id FK
    uuid account_id FK
    text title
    text description
    enum status "ide sampai terposting"
    timestamptz target_at "nullable"
    text_array tags
    uuid schedule_id FK "nullable"
    text occurrence_key "nullable, unik per schedule"
  }
  item_stage_deadlines {
    uuid item_id PK
    enum stage PK
    timestamptz due_at
  }
  notes {
    uuid id PK
    text user_id FK
    uuid account_id FK
    uuid item_id FK "nullable"
    text body_md
  }
  schedules {
    uuid id PK
    text user_id FK
    uuid account_id FK
    text title
    text rrule "tanpa DTSTART dan TZID"
    timestamp dtstart_local "jam dinding"
    bool active
  }
  schedule_exceptions {
    uuid id PK
    text user_id FK
    uuid schedule_id FK
    text occurrence_key "unik per schedule"
    enum kind "skip, move"
    timestamp moved_to_local "nullable"
  }
  reminder_settings {
    uuid id PK
    text user_id FK
    uuid account_id FK
    uuid item_id FK "salah satu"
    uuid schedule_id FK "salah satu"
    int offset_minutes "lebih dari atau sama dengan 0"
  }
  reminders {
    uuid id PK
    text user_id FK
    uuid account_id FK
    uuid reminder_setting_id FK
    text occurrence_key "unik bersama setting_id"
    timestamptz target_at
    timestamptz send_at
    enum status "pending, sending, sent, cancelled, failed"
    int attempts
    timestamptz claimed_at
    timestamptz enqueued_send_at
    timestamptz sent_at
    text last_error
  }
```

Catatan ERD:
- `occurrence_key` = jam dinding asli kemunculan, format `YYYY-MM-DDTHH:mm` (mis. `2026-12-01T19:00`). Kunci ini **tidak berubah** walau zona waktu akun diganti, jadi pengecualian dan item yang tertaut tetap menempel ke slot yang benar. Untuk item sekali-jadi, kuncinya konstan `once`.
- `reminder_settings` adalah definisi ("H-1 hari"). `reminders` adalah baris konkret per kemunculan yang benar-benar akan dikirim, dan hanya dibuat jika `send_at`-nya jatuh dalam 48 jam ke depan (lihat §4).
- `status` item: `ide → naskah → produksi → editing → siap → terposting`.
- Enum platform hanya berisi 3 sesuai brief. Menambah "lainnya" berarti fitur baru, jadi tanya dulu.
- Hapus akun memakai `ON DELETE CASCADE` dari `user`.
- RLS diaktifkan di **semua** tabel `public`, termasuk tabel Better Auth, tanpa policy.

## 3. Jadwal berulang: dihitung saat dibutuhkan

Aturan disimpan sebagai satu baris (`rrule` + `dtstart_local` + zona waktu akun). Kemunculan dihitung saat kalender, dashboard, atau pengisi pengingat butuh rentang tertentu.

Langkah menghitung kemunculan di rentang `[from, to)`:
1. Ubah `from`/`to` ke jam dinding zona akun, beri margin ±1 hari.
2. Jalankan `rrule` dengan `dtstart` "mengambang": komponen jam dinding dibungkus `Date.UTC(...)`, **tanpa TZID**. Dengan begitu `rrule` hanya berhitung kalender dan tidak menyentuh zona waktu, padahal bagian zona waktu itulah yang paling banyak bug-nya.
3. Setiap hasil → `Temporal.PlainDateTime` → `.toZonedDateTime(tz, { disambiguation: 'compatible' })` → instant UTC.
4. Terapkan pengecualian: `skip` dibuang, `move` diganti `moved_to_local`.
5. Slot yang sudah punya `content_items` tertaut (`schedule_id + occurrence_key`) ditampilkan sebagai item itu, di `target_at` milik item.
6. Saring hasil ke `[from, to)` berdasarkan instant.

DST (zona yang punya jam musim panas, mis. `America/New_York`):
- Jam yang tidak ada (02:30 saat jam maju) digeser `compatible` ke 03:30.
- Jam yang muncul dua kali (01:30 saat jam mundur): `compatible` memilih yang pertama.
- Asia/Jakarta tidak punya DST, jadi **test juga wajib memakai zona ber-DST**.

Kapan item dibuat dari slot: saat pengguna mulai mengerjakan slot itu (mengisi judul, mengubah status, atau menambah catatan). Sebelum itu, slot hanya "virtual".

## 4. Alur pengingat

```mermaid
sequenceDiagram
  autonumber
  participant U as UI / Server Action
  participant DB as reminders (DB)
  participant R as reconcile()
  participant Q as Vercel Queues
  participant C as Consumer
  participant M as Resend

  Note over U,DB: Saat item/aturan/pengingat dibuat atau diubah
  U->>DB: transaksi: upsert baris pending, batalkan baris yang tidak berlaku
  U-->>Q: setelah commit: send() jika send_at < now+48 jam
  Note over R: Cron harian dan penyapu 15 mnt memanggil fungsi yang sama
  R->>DB: materialisasi baris dengan send_at dalam 48 jam ke depan (upsert, unik setting+occurrence)
  R->>DB: kembalikan 'sending' yang macet lebih dari 5 mnt ke 'pending'
  R->>DB: pending yang sudah lewat send_at lebih dari 2 mnt: deliver() langsung di sini
  R->>DB: ambil pending masa depan dengan enqueued_send_at berbeda dari send_at
  R->>Q: send(delaySeconds, idempotencyKey = id:send_at)
  R->>DB: set enqueued_send_at = send_at
  Q->>C: kirim pesan (bisa dua kali)
  Note over C,M: deliver(id, send_at): fungsi yang sama dipakai konsumen dan reconcile()
  C->>DB: baca baris. Tidak ada, bukan pending, atau send_at beda: ack, selesai
  C->>DB: UPDATE status='sending' WHERE id=$1 AND status='pending' AND send_at=$2
  alt 0 baris berubah
    C-->>Q: ack (duplikat, sudah diproses)
  else 1 baris berubah
    C->>M: kirim email, Idempotency-Key = reminder:id:send_at
    alt sukses
      C->>DB: status='sent', sent_at=now
    else gagal, attempts < 5
      C->>DB: status='pending', attempts+1, last_error
      C-->>Q: lempar error, queue retry dengan backoff
    else gagal, attempts = 5
      C->>DB: status='failed' (tampil di UI)
    end
  end
```

Kenapa bentuknya begini (ringkas; detail di DECISIONS.md):
- **Pesan queue tidak bisa dibatalkan.** Tidak ada API hapus untuk pengirim. Karena itu pembatalan dan penjadwalan ulang dilakukan di DB, dan konsumen **selalu membaca ulang baris** sebelum bertindak. Pesan basi otomatis jadi no-op. Ini juga menangani akun yang sudah dihapus.
- **Ada dua kunci idempotency yang berbeda:**
  - DB: unik `(reminder_setting_id, occurrence_key)`, supaya tidak ada baris ganda.
  - Queue: `id:send_at`. Dedup queue berlaku selama retensi pesan. Saat pengingat digeser, `send_at` baru menghasilkan kunci baru, jadi pesan barunya diterima.
- **Status `sending` (usulan tambahan)**, lihat D-007. Tanpa status ini, crash setelah klaim membuat pengingat hilang diam-diam.
- **Jendela 48 jam, retensi = delay + 24 jam.** Delay maksimum Queues 7 hari, dan delay yang melebihi TTL ditolak (HTTP 400). Retensi default hanya 24 jam, jadi harus selalu diisi eksplisit. Dengan jendela 48 jam, satu kali cron harian yang gagal masih aman.
- **Jendela dihitung dari `send_at`, bukan dari waktu posting.** Untuk mencari kemunculan, `reconcile()` melihat sejauh 48 jam + offset terbesar di aturan itu. Tanpa ini, pengingat "H-3 hari" baru dibuat saat waktunya sudah lewat sehari.
- **Penyapu memanggil `reconcile()` yang sama**, dan baris pending yang sudah lewat waktu **dikirim langsung** lewat `deliver()`, tidak di-enqueue ulang. Alasannya: enqueue ulang dengan kunci `id:send_at` yang sama akan dibuang dedup queue. Ini menutup kasus crash setelah klaim: queue mengirim ulang, konsumen melihat `sending` lalu ack, penyapu memulihkan baris ke `pending`, dan `deliver()` di penyapu mengirimnya. Kunci Resend yang sama mencegah email ganda jika email pertama ternyata sudah terkirim.
- Pengingat yang `send_at`-nya sudah lewat saat dibuat (mis. "H-1" untuk posting 2 jam lagi) dikirim segera (`delaySeconds: 0`). Ini asumsi dan bisa diubah.

## 5. Isolasi data

- **Isolasi antar-pengguna dijaga DAL, bukan RLS.** App terhubung sebagai role `postgres` yang mem-bypass RLS. RLS deny-all hanya menutup Data API Supabase (anon/authenticated key).
- Setiap fungsi DAL menerima `userId` dari sesi yang sudah divalidasi, tidak pernah dari input. ID di URL selalu dipakai bersama `user_id`. Baris milik orang lain menghasilkan 404, bukan 403, supaya tidak bocor bahwa ID itu ada.
- FK komposit menjadi lapisan kedua di DB.
- Test isolasi (Fase 1 dan seterusnya): pengguna B mencoba membaca, mengubah, dan menghapus milik A lewat setiap fungsi DAL dan setiap route. Semuanya harus gagal.
- Test RLS: query `pg_tables` dan `pg_policies`. Test gagal jika ada tabel `public` dengan `rowsecurity = false` atau tabel yang punya policy.

## 6. Analisis risiko

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| 1 | Zona waktu salah hitung (DST, TZ host server berbeda) | Pengingat meleset 1 jam | Temporal untuk konversi, `rrule` tanpa TZID, test di Asia/Jakarta + America/New_York, CI menjalankan test dengan `TZ=UTC` dan `TZ=America/New_York` |
| 2 | Pengguna mengganti zona waktu akun | Slot bergeser, pengecualian lepas | `occurrence_key` = jam dinding; reconcile membatalkan lalu membuat ulang pending reminder akun itu; test khusus. Semantiknya menunggu jawaban (Q1) |
| 3 | Pesan queue terkirim dua kali (at-least-once) | Email ganda | UPDATE bersyarat atomik + `Idempotency-Key` Resend (24 jam) + test kirim pesan yang sama 2x |
| 4 | Crash setelah klaim, Resend gagal, atau jatah delivery queue habis | Pengingat hilang | Status `sending` + lease 5 mnt yang dipulihkan penyapu; penyapu mengirim langsung pending yang lewat waktu; retry dengan backoff; `failed` setelah 5 percobaan |
| 5 | Batas delay 7 hari, retensi default 24 jam | Pesan ditolak atau kedaluwarsa | Jendela 48 jam; `retentionSeconds` eksplisit |
| 6 | Pesan basi setelah item diubah atau dihapus | Email salah | Konsumen membaca ulang baris dan mencocokkan `status` + `send_at` |
| 7 | Vercel Queues masih Beta (`experimentalTriggers`, `queue/v2beta`) | API berubah | Semua akses queue di satu adapter `src/server/queue.ts`; pindah ke QStash cukup mengganti satu file |
| 8 | Cron Vercel Hobby: minimal 1x/hari, presisi ±59 mnt, bisa terlewat atau ganda | Pengisian telat | Cron hanya mengisi; jendela 48 jam; penyapu tiap 15 mnt; reconcile idempotent |
| 9 | Cron Jobs Hobby tidak bisa tiap 15 mnt untuk penyapu | Jaring pengaman lemah | Penyapu memakai Vercel Schedules (Beta; Hobby: tiap 15 mnt, jitter 15 mnt, 5.000 run/periode). Cron harian tetap Cron Jobs biasa, jadi masih ada pengisi jika Schedules bermasalah. Lihat D-009 |
| 10 | Supabase Free pause setelah 1 minggu tidak aktif | App mati | `/api/health` + GH Actions harian. Cron reconcile harian juga menyentuh DB, jadi ada dua sumber aktivitas |
| 11 | GitHub mematikan workflow terjadwal di repo publik yang 60 hari tanpa aktivitas | Keep-alive berhenti | Cron Vercel tetap menyentuh DB; README menjelaskan cara mengaktifkan ulang |
| 12 | Resend tanpa domain terverifikasi kemungkinan hanya bisa mengirim ke email pemilik akun Resend | Pengguna lain tidak menerima email | **Belum terverifikasi.** Dicek di Fase 4; demo memakai email pemilik, atau verifikasi domain |
| 13 | Transaction pooler Supabase | Error prepared statement | `prepare: false`; migrasi lewat `DIRECT_URL` |
| 14 | Query lupa filter `user_id` | Kebocoran data | DAL tunggal + lint yang melarang impor `db` + test isolasi + FK komposit |
| 15 | Spam email atau brute force | Biaya, penyalahgunaan | Upstash ratelimit di login, pembuatan item, dan endpoint pemicu email; endpoint cron/penyapu dilindungi `CRON_SECRET` |
