import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { contentAccounts, contentItems, reminderSettings, reminders, user } from "@/db/schema";
import { archiveContentAccount, createContentAccount, updateContentAccount } from "@/server/dal/content-accounts";
import { createContentItem, deleteContentItem, updateContentItem } from "@/server/dal/content-items";
import {
  addReminderSetting,
  listReminderSettings,
  listFailedReminders,
  listReminderStatuses,
  listReminderSummaries,
  removeReminderSetting,
  retryFailedReminder,
} from "@/server/dal/reminder-settings";
import { deliver, reconcile, type Email, type ReminderDeps, type ReminderMessage } from "@/server/dal/reminders";
import { clearException, createSchedule, fillSlot, setException } from "@/server/dal/schedules";
import { saveUserSettings } from "@/server/dal/user-settings";

afterAll(() => closeDb());

// Fakes for the queue and Resend. The fake mailer behaves like Resend's Idempotency-Key: same key, one email.
function fakes() {
  const queued: { message: ReminderMessage; options: { delaySeconds: number; retentionSeconds: number; idempotencyKey: string } }[] = [];
  const emails: Email[] = [];
  const seenKeys = new Set<string>();
  let failures = 0;
  const deps: ReminderDeps = {
    appUrl: "https://montenku.test",
    queue: { send: async (message, options) => void queued.push({ message, options }) },
    push: { send: async () => "ok" },
    mailer: {
      send: async (email, key) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("Resend 500");
        }
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        emails.push(email);
      },
    },
  };
  return { deps, queued, emails, failNext: (n: number) => void (failures = n) };
}

const at = (iso: string) => new Date(iso);
const later = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

// Posting at Wed 25 Nov 2026 19:00 WIB = 12:00 UTC; a "2 hours before" reminder is due at 10:00 UTC.
const TARGET = "2026-11-25T19:00";
const DUE = at("2026-11-25T10:00:00Z");
const DAY_BEFORE = at("2026-11-24T12:00:00Z");

async function setup(timezone = "Asia/Jakarta") {
  const userId = `rem-${randomUUID()}`;
  await db.insert(user).values({ id: userId, name: "Uji", email: `${userId}@example.com` });
  const accountId = (await createContentAccount(userId, { name: "Masak Hemat", platform: "tiktok", handle: "mh", color: "#e4572e", timezone })).id;
  const item = (await createContentItem(userId, {
    title: "Resep nasi goreng",
    description: "",
    accountId,
    status: "idea",
    tags: [],
    targetWallTime: TARGET,
    deadlines: {},
  }))!;
  return { userId, accountId, itemId: item.id };
}

const rowsOf = (userId: string) => db.select().from(reminders).where(eq(reminders.userId, userId));

describe("reconcile(): membuat dan mengantrekan pengingat", () => {
  it("membuat baris dalam jendela 48 jam dan mengantrekannya dengan delay, retensi, dan kunci id:send_at", async () => {
    const { deps, queued } = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 120);

    const result = await reconcile(deps, { now: DAY_BEFORE, userId });
    const [row] = await rowsOf(userId);
    expect(row).toMatchObject({ status: "pending", occurrenceKey: "once" });
    expect(row?.sendAt.toISOString()).toBe(DUE.toISOString());
    expect(result.enqueued).toBe(1);
    expect(queued[0]?.options).toEqual({
      delaySeconds: 22 * 3600,
      retentionSeconds: 22 * 3600 + 24 * 3600,
      idempotencyKey: `${row?.id}:${DUE.toISOString()}`,
    });

    // Running again changes nothing and queues nothing new.
    await reconcile(deps, { now: later(DAY_BEFORE, 5), userId });
    expect(queued).toHaveLength(1);
    expect(await rowsOf(userId)).toHaveLength(1);
  });

  it("di luar jendela 48 jam belum dibuat; dibuat saat jendela sampai", async () => {
    const { deps } = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 0); // send at 12:00 UTC on the 25th

    await reconcile(deps, { now: at("2026-11-23T11:00:00Z"), userId }); // 49h before
    expect(await rowsOf(userId)).toHaveLength(0);
    await reconcile(deps, { now: at("2026-11-23T13:00:00Z"), userId }); // 47h before
    expect(await rowsOf(userId)).toHaveLength(1);
  });

  it("pengingat yang waktunya sudah lewat saat dibuat langsung dikirim (posting masih di depan)", async () => {
    const { deps, emails } = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 1440); // H-1: due 24 Nov 12:00 UTC, already past
    const result = await reconcile(deps, { now: at("2026-11-25T08:00:00Z"), userId });
    expect(result.delivered).toBe(1);
    expect(emails).toHaveLength(1);
  });
});

describe("deliver(): tepat satu kali (D-007)", () => {
  async function queuedReminder() {
    const f = fakes();
    const s = await setup();
    await addReminderSetting(s.userId, { itemId: s.itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE, userId: s.userId });
    const message = f.queued[0]!.message;
    return { ...f, ...s, message };
  }

  it("isi email: akun, judul, jam di zona akun, dan tautan ke item", async () => {
    const { deps, emails, message, userId, itemId } = await queuedReminder();
    expect(await deliver(deps, message, DUE)).toBe("sent");
    expect(emails[0]).toEqual({
      to: `${userId}@example.com`,
      subject: "Pengingat: Resep nasi goreng (Masak Hemat)",
      text: [
        '2 jam sebelum: "Resep nasi goreng" di akun Masak Hemat.',
        "Waktu posting: Rabu, 25 November 2026, 19:00 WIB",
        "",
        `Buka di Montenku: https://montenku.test/konten/${itemId}`,
      ].join("\n"),
    });
    expect((await rowsOf(userId))[0]).toMatchObject({ status: "sent", attempts: 0 });
  });

  it("pesan yang sama dikirim 2x: email terkirim 1x", async () => {
    const { deps, emails, message } = await queuedReminder();
    expect(await deliver(deps, message, DUE)).toBe("sent");
    expect(await deliver(deps, message, later(DUE, 1))).toBe("skipped");
    expect(emails).toHaveLength(1);
  });

  it("konsumen dan penyapu berjalan bersamaan untuk baris yang sama: email terkirim 1x", async () => {
    const { deps, emails, message, userId } = await queuedReminder();
    await Promise.all([deliver(deps, message, DUE), reconcile(deps, { now: DUE, userId }), deliver(deps, message, DUE)]);
    expect(emails).toHaveLength(1);
    expect((await rowsOf(userId))[0]?.status).toBe("sent");
  });

  it("crash setelah klaim, sebelum Resend: penyapu memulihkan dan mengirim, 1 email", async () => {
    const { deps, emails, message, userId } = await queuedReminder();
    // The consumer claimed the row and then died.
    await db.update(reminders).set({ status: "sending", claimedAt: DUE }).where(eq(reminders.id, message.id));

    await reconcile(deps, { now: later(DUE, 2), userId }); // lease (5 min) not over yet: leave it
    expect(emails).toHaveLength(0);
    const result = await reconcile(deps, { now: later(DUE, 6), userId });
    expect(result).toMatchObject({ recovered: 1, delivered: 1 });
    expect(emails).toHaveLength(1);
  });

  it("crash setelah Resend sukses, sebelum status sent: kirim ulang memakai kunci yang sama, Resend mencatat 1 email", async () => {
    const { deps, emails, message, userId } = await queuedReminder();
    await deliver(deps, message, DUE);
    // Pretend the "mark as sent" write never happened.
    await db.update(reminders).set({ status: "sending", claimedAt: DUE, sentAt: null }).where(eq(reminders.id, message.id));

    await reconcile(deps, { now: later(DUE, 6), userId });
    expect(emails).toHaveLength(1);
    expect((await rowsOf(userId))[0]?.status).toBe("sent");
  });

  it("Resend gagal: kembali pending dan dilempar ulang (queue mengulang); 5x gagal jadi failed", async () => {
    const { deps, emails, failNext, message, userId } = await queuedReminder();
    failNext(5);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(deliver(deps, message, later(DUE, attempt))).rejects.toThrow("Resend 500");
      const [row] = await rowsOf(userId);
      expect(row).toMatchObject({ attempts: attempt, status: attempt < 5 ? "pending" : "failed", lastError: "Resend 500" });
    }
    expect(await deliver(deps, message, later(DUE, 10))).toBe("skipped");
    expect(emails).toHaveLength(0);
  });

  it("item digeser: baris pindah, pesan baru diantrekan, pesan lama jadi no-op", async () => {
    const { deps, queued, emails, message, userId, itemId, accountId } = await queuedReminder();
    await updateContentItem(userId, itemId, {
      title: "Resep nasi goreng",
      description: "",
      accountId,
      status: "idea",
      tags: [],
      targetWallTime: "2026-11-25T21:00", // two hours later
      deadlines: {},
    });
    await reconcile(deps, { now: later(DAY_BEFORE, 10), userId });
    const moved = queued[1]!.message;
    expect(moved.sendAt).toBe("2026-11-25T12:00:00.000Z");
    expect(queued[1]!.options.idempotencyKey).not.toBe(queued[0]!.options.idempotencyKey);

    expect(await deliver(deps, message, DUE)).toBe("skipped");
    expect(await deliver(deps, moved, new Date(moved.sendAt))).toBe("sent");
    expect(emails).toHaveLength(1);
  });

  it("item dihapus: pesan lama jadi no-op", async () => {
    const { deps, emails, message, userId, itemId } = await queuedReminder();
    await deleteContentItem(userId, itemId);
    expect(await deliver(deps, message, DUE)).toBe("skipped");
    expect(emails).toHaveLength(0);
  });

  it("pengaturan dihapus atau akun diarsipkan: tidak ada email", async () => {
    const a = await queuedReminder();
    const [setting] = await listReminderSettings(a.userId, { itemId: a.itemId });
    await removeReminderSetting(a.userId, setting!.id);
    expect(await deliver(a.deps, a.message, DUE)).toBe("skipped");

    const b = await queuedReminder();
    await archiveContentAccount(b.userId, b.accountId);
    expect((await reconcile(b.deps, { now: later(DAY_BEFORE, 1), userId: b.userId })).cancelled).toBe(1);
    expect(await deliver(b.deps, b.message, DUE)).toBe("skipped");
    expect([...a.emails, ...b.emails]).toHaveLength(0);
  });
});

describe("pengingat jadwal berulang", () => {
  async function weekly() {
    const f = fakes();
    const s = await setup();
    const scheduleId = (await createSchedule(s.userId, {
      accountId: s.accountId,
      title: "Upload resep",
      rrule: "FREQ=WEEKLY;BYDAY=TU,FR",
      dtstartLocal: "2026-11-03T19:00",
    }))!;
    await addReminderSetting(s.userId, { scheduleId }, 60);
    return { ...f, ...s, scheduleId };
  }

  it("satu pengingat per kemunculan dalam jendela; yang dilewati dibatalkan", async () => {
    const { deps, userId, scheduleId } = await weekly();
    const now = at("2026-11-23T12:00:00Z"); // Mon 19:00 WIB: window to Wed 19:00
    await reconcile(deps, { now, userId });
    expect((await rowsOf(userId)).map((r) => r.occurrenceKey)).toEqual(["2026-11-24T19:00"]);

    await setException(userId, scheduleId, "2026-11-24T19:00", { kind: "skip" });
    expect((await reconcile(deps, { now: later(now, 1), userId })).cancelled).toBe(1);
    expect((await rowsOf(userId))[0]?.status).toBe("cancelled");

    // Undoing the skip brings it back.
    await clearException(userId, scheduleId, "2026-11-24T19:00");
    await reconcile(deps, { now: later(now, 2), userId });
    expect((await rowsOf(userId))[0]?.status).toBe("pending");
  });

  it("slot yang sudah diisi: email memakai judul dan tautan item", async () => {
    const { deps, emails, userId, scheduleId } = await weekly();
    const itemId = (await fillSlot(userId, scheduleId, "2026-11-24T19:00"))!;
    await db.update(contentItems).set({ title: "Nasi goreng spesial" }).where(eq(contentItems.id, itemId));

    await reconcile(deps, { now: at("2026-11-24T11:00:00Z"), userId }); // 18:00 WIB, reminder due now
    expect(emails[0]?.subject).toBe("Pengingat: Nasi goreng spesial (Masak Hemat)");
    expect(emails[0]?.text).toContain(`/konten/${itemId}`);
  });

  // Q1: the rule keeps 19:00 on the wall clock of the new zone, so pending reminders move.
  it("zona akun diganti Jakarta -> Tokyo: pengingat yang belum terkirim maju 2 jam dan diantrekan ulang", async () => {
    const { deps, queued, userId, accountId } = await weekly();
    const now = at("2026-11-23T12:00:00Z");
    await reconcile(deps, { now, userId });
    const before = (await rowsOf(userId))[0]!.sendAt;

    await updateContentAccount(userId, accountId, { name: "Masak Hemat", platform: "tiktok", handle: "mh", color: "#e4572e", timezone: "Asia/Tokyo" });
    await reconcile(deps, { now: later(now, 1), userId });
    const after = (await rowsOf(userId))[0]!.sendAt;
    expect(before.getTime() - after.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(queued.at(-1)?.message.sendAt).toBe(after.toISOString());
  });
});

describe("isolasi pengaturan pengingat", () => {
  it("pengguna lain tidak bisa menambah, melihat, atau menghapus pengingat di item atau jadwal orang lain", async () => {
    const alice = await setup();
    const bob = await setup();
    const scheduleId = (await createSchedule(alice.userId, {
      accountId: alice.accountId,
      title: "Milik Alice",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstartLocal: "2026-11-02T08:00",
    }))!;
    await addReminderSetting(alice.userId, { itemId: alice.itemId }, 60);

    expect(await addReminderSetting(bob.userId, { itemId: alice.itemId }, 30)).toBe(false);
    expect(await addReminderSetting(bob.userId, { scheduleId }, 30)).toBe(false);
    expect(await listReminderSettings(bob.userId, { itemId: alice.itemId })).toEqual([]);
    const [setting] = await listReminderSettings(alice.userId, { itemId: alice.itemId });
    expect(await removeReminderSetting(bob.userId, setting!.id)).toBe(false);
    expect(await listReminderSettings(alice.userId, { itemId: alice.itemId })).toHaveLength(1);

    // Second layer: the database refuses a setting or reminder that points at someone else's rows.
    await expect(db.insert(reminderSettings).values({ userId: bob.userId, itemId: alice.itemId, offsetMinutes: 30 })).rejects.toThrow();
    await expect(
      db.insert(reminders).values({ userId: bob.userId, reminderSettingId: setting!.id, occurrenceKey: "x", targetAt: DUE, sendAt: DUE }),
    ).rejects.toThrow();
    // And a setting must have exactly one target.
    await expect(db.insert(reminderSettings).values({ userId: alice.userId, offsetMinutes: 30 })).rejects.toThrow();
    expect(await db.$count(contentAccounts, eq(contentAccounts.userId, bob.userId))).toBe(1);
  });
});

describe("Kirim ulang pengingat yang gagal", () => {
  it("gagal 5x lalu dikirim ulang: kembali pending, terkirim sekali; status terlihat di daftar", async () => {
    const f = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE, userId });
    const message = f.queued[0]!.message;

    f.failNext(5);
    for (let attempt = 1; attempt <= 5; attempt++) await deliver(f.deps, message, later(DUE, attempt)).catch(() => {});
    expect((await listReminderStatuses(userId, { itemId }))[0]).toMatchObject({ status: "failed", lastError: "Resend 500" });

    expect(await retryFailedReminder(userId, message.id)).toBe(true);
    expect(await retryFailedReminder(userId, message.id)).toBe(false); // only a failed one can be retried
    expect((await reconcile(f.deps, { now: later(DUE, 10), userId })).delivered).toBe(1);
    expect(f.emails).toHaveLength(1);
    expect((await listReminderStatuses(userId, { itemId }))[0]).toMatchObject({ status: "sent", lastError: null });
  });

  it("pengguna lain tidak bisa melihat atau mengirim ulang pengingat orang lain", async () => {
    const f = fakes();
    const alice = await setup();
    const bob = await setup();
    await addReminderSetting(alice.userId, { itemId: alice.itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE, userId: alice.userId });
    const id = f.queued[0]!.message.id;
    await db.update(reminders).set({ status: "failed" }).where(eq(reminders.id, id));

    expect(await listReminderStatuses(bob.userId, { itemId: alice.itemId })).toEqual([]);
    expect(await retryFailedReminder(bob.userId, id)).toBe(false);
    expect((await listReminderStatuses(alice.userId, { itemId: alice.itemId }))[0]?.status).toBe("failed");
  });
});

describe("Pengaturan: email mati dan jam senyap (D-032)", () => {
  const off = { emailEnabled: false, timezone: "Asia/Jakarta", quiet: null };

  it("jam senyap menggeser send_at: 17:00 WIB di jam senyap 16:00 sampai 18:00 jadi 18:00 WIB", async () => {
    const f = fakes();
    const { userId, itemId } = await setup();
    await saveUserSettings(userId, { emailEnabled: true, timezone: "Asia/Jakarta", quiet: { start: "16:00", end: "18:00" } });
    await addReminderSetting(userId, { itemId }, 120);

    await reconcile(f.deps, { now: DAY_BEFORE, userId });
    const [row] = await rowsOf(userId);
    expect(row?.sendAt.toISOString()).toBe("2026-11-25T11:00:00.000Z");
    expect(f.queued[0]?.options.idempotencyKey).toBe(`${row?.id}:2026-11-25T11:00:00.000Z`);
  });

  it("email dimatikan: pengingat pending dibatalkan, termasuk yang sudah lewat, dan tidak ada email", async () => {
    const f = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE, userId });
    const message = f.queued[0]!.message;

    await saveUserSettings(userId, off);
    // A queue message that arrives before reconcile() ran: the claim refuses it.
    expect(await deliver(f.deps, message, DUE)).toBe("skipped");
    // The posting time has already passed: still cancelled, never sent late.
    expect((await reconcile(f.deps, { now: at("2026-11-25T12:30:00Z"), userId })).cancelled).toBe(1);
    expect((await rowsOf(userId))[0]?.status).toBe("cancelled");
    expect(f.emails).toEqual([]);
  });

  it("email dinyalakan lagi: pengingat yang dibatalkan hidup kembali", async () => {
    const f = fakes();
    const { userId, itemId } = await setup();
    await addReminderSetting(userId, { itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE, userId });
    await saveUserSettings(userId, off);
    await reconcile(f.deps, { now: later(DAY_BEFORE, 1), userId });
    expect((await rowsOf(userId))[0]?.status).toBe("cancelled");

    await saveUserSettings(userId, { ...off, emailEnabled: true });
    await reconcile(f.deps, { now: later(DAY_BEFORE, 2), userId });
    expect((await rowsOf(userId))[0]?.status).toBe("pending");
    expect(await deliver(f.deps, f.queued.at(-1)!.message, DUE)).toBe("sent");
    expect(f.emails).toHaveLength(1);
  });

  it("mematikan email satu pengguna tidak memengaruhi pengguna lain (cron tanpa userId)", async () => {
    const f = fakes();
    const alice = await setup();
    const bob = await setup();
    await addReminderSetting(alice.userId, { itemId: alice.itemId }, 120);
    await addReminderSetting(bob.userId, { itemId: bob.itemId }, 120);
    await saveUserSettings(alice.userId, off);

    await reconcile(f.deps, { now: DAY_BEFORE });
    expect(await rowsOf(alice.userId)).toEqual([]);
    expect((await rowsOf(bob.userId))[0]?.status).toBe("pending");
  });
});

describe("query dashboard: pengingat (D-033)", () => {
  it("ringkasan pengingat per item dan pengingat gagal, hanya milik sendiri", async () => {
    const f = fakes();
    const alice = await setup();
    const bob = await setup();
    await addReminderSetting(alice.userId, { itemId: alice.itemId }, 120);
    await addReminderSetting(bob.userId, { itemId: bob.itemId }, 120);
    await reconcile(f.deps, { now: DAY_BEFORE });
    await db.update(reminders).set({ status: "failed" }).where(eq(reminders.userId, alice.userId));

    const both = { itemIds: [alice.itemId, bob.itemId], scheduleIds: [] };
    expect(await listReminderSummaries(alice.userId, both)).toEqual([
      expect.objectContaining({ itemId: alice.itemId, offsetMinutes: 120, status: "failed", sendAt: DUE }),
    ]);
    expect(await listReminderSummaries(alice.userId, { itemIds: [], scheduleIds: [] })).toEqual([]);

    expect(await listFailedReminders(alice.userId, DAY_BEFORE)).toEqual([
      expect.objectContaining({ offsetMinutes: 120, title: "Resep nasi goreng", accountName: "Masak Hemat", href: `/konten/${alice.itemId}` }),
    ]);
    // Older than the cut-off: no longer on the dashboard (it stays on the item page).
    expect(await listFailedReminders(alice.userId, later(DUE, 24 * 60))).toEqual([]);
    expect(await listFailedReminders(bob.userId, DAY_BEFORE)).toEqual([]);
  });
});
