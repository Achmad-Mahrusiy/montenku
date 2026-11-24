import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { pushSubscriptions, reminders, user } from "@/db/schema";
import { createContentAccount } from "@/server/dal/content-accounts";
import { createContentItem } from "@/server/dal/content-items";
import { deletePushSubscription, hasPushSubscription, savePushSubscription } from "@/server/dal/push-subscriptions";
import { addReminderSetting, listFailedReminders, listReminderStatuses, listReminderSummaries } from "@/server/dal/reminder-settings";
import { deliver, reconcile, type Email, type PushMessage, type ReminderDeps, type ReminderMessage } from "@/server/dal/reminders";
import { saveUserSettings } from "@/server/dal/user-settings";

afterAll(() => closeDb());

type Behaviour = "ok" | "gone" | "fail";

/** Fakes for the queue, Resend and the push services. Each device answers as its behaviour says. */
function fakes(behaviour: Record<string, Behaviour> = {}) {
  const queued: ReminderMessage[] = [];
  const emails: Email[] = [];
  const seenKeys = new Set<string>();
  const pushes: { endpoint: string; message: PushMessage; ttlSeconds: number; topic: string }[] = [];
  const deps: ReminderDeps = {
    appUrl: "https://montenku.test",
    queue: { send: async (message) => void queued.push(message) },
    mailer: {
      send: async (email, key) => {
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        emails.push(email);
      },
    },
    push: {
      send: async (target, message, options) => {
        const answer = behaviour[target.endpoint] ?? "ok";
        if (answer === "fail") throw new Error("Push 503 sibuk");
        if (answer === "ok") pushes.push({ endpoint: target.endpoint, message, ...options });
        return answer;
      },
    },
  };
  return { deps, queued, emails, pushes };
}

const at = (iso: string) => new Date(iso);
const later = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
// Posting Wed 25 Nov 2026 19:00 WIB = 12:00 UTC; "2 hours before" is due at 10:00 UTC.
const DUE = at("2026-11-25T10:00:00Z");
const DAY_BEFORE = at("2026-11-24T12:00:00Z");
const device = (name: string) => ({ endpoint: `https://push.example/${name}-${randomUUID()}`, p256dh: "kunci-publik", auth: "rahasia" });

async function setup(options: { email?: boolean; devices?: number } = {}) {
  const userId = `push-${randomUUID()}`;
  await db.insert(user).values({ id: userId, name: "Uji", email: `${userId}@example.com` });
  if (options.email === false) await saveUserSettings(userId, { emailEnabled: false, timezone: "Asia/Jakarta", quiet: null });
  const devices = Array.from({ length: options.devices ?? 0 }, (_, i) => device(`hp${i}`));
  for (const d of devices) await savePushSubscription(userId, d);
  const accountId = (await createContentAccount(userId, { name: "Masak Hemat", platform: "tiktok", handle: "mh", color: "#e4572e", timezone: "Asia/Jakarta" })).id;
  const item = (await createContentItem(userId, { title: "Resep nasi goreng", description: "", accountId, status: "idea", tags: [], targetWallTime: "2026-11-25T19:00", deadlines: {} }))!;
  await addReminderSetting(userId, { itemId: item.id }, 120);
  return { userId, itemId: item.id, devices };
}

const rowsOf = (userId: string) => db.select().from(reminders).where(eq(reminders.userId, userId));
const rowOf = async (userId: string, channel: "email" | "push") => (await rowsOf(userId)).find((r) => r.channel === channel);
const messageOf = (row: { id: string; sendAt: Date }): ReminderMessage => ({ id: row.id, sendAt: row.sendAt.toISOString() });

describe("pengingat per kanal: email dan push (D-036)", () => {
  it("email nyala dan satu perangkat: dua baris, satu email dan satu push", async () => {
    const { deps, emails, pushes } = fakes();
    const { userId } = await setup({ devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    expect((await rowsOf(userId)).map((r) => r.channel).sort()).toEqual(["email", "push"]);

    await reconcile(deps, { now: DUE, userId });
    expect(emails).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect((await rowsOf(userId)).every((r) => r.status === "sent")).toBe(true);
  });

  it("status di panel, ringkasan dashboard, dan peringatan gagal menyebut kanalnya", async () => {
    const { userId, itemId, devices } = await setup({ devices: 1 });
    const { deps } = fakes({ [devices[0]!.endpoint]: "fail" });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    const message = messageOf((await rowOf(userId, "push"))!);
    for (let attempt = 0; attempt < 5; attempt++) await deliver(deps, message, later(DUE, attempt)).catch(() => {});

    const statuses = await listReminderStatuses(userId, { itemId });
    expect(statuses.map((r) => [r.channel, r.status]).sort()).toEqual([
      ["email", "pending"],
      ["push", "failed"],
    ]);
    expect((await listReminderSummaries(userId, { itemIds: [itemId], scheduleIds: [] })).map((r) => r.channel).sort()).toEqual(["email", "push"]);
    expect((await listFailedReminders(userId, DAY_BEFORE)).map((r) => r.channel)).toEqual(["push"]);
  });

  it("tanpa perangkat: hanya baris email (perilaku lama tetap)", async () => {
    const { deps } = fakes();
    const { userId } = await setup();
    await reconcile(deps, { now: DAY_BEFORE, userId });
    expect((await rowsOf(userId)).map((r) => r.channel)).toEqual(["email"]);
  });

  it("email mati, satu perangkat: push tetap terkirim, tidak ada baris email", async () => {
    const { deps, emails, pushes, queued } = fakes();
    const { userId } = await setup({ email: false, devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    expect((await rowsOf(userId)).map((r) => r.channel)).toEqual(["push"]);

    // Through the queue consumer, so the claim itself must accept a push row of an email-off user.
    expect(await deliver(deps, queued[0]!, DUE)).toBe("sent");
    expect(pushes).toHaveLength(1);
    expect(emails).toHaveLength(0);
  });

  it("isi push: judul, waktu di zona akun, tautan, tag, TTL sampai waktu posting, topic 32 karakter", async () => {
    const { deps, pushes } = fakes();
    const { userId, itemId } = await setup({ email: false, devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    await reconcile(deps, { now: DUE, userId });
    const row = (await rowOf(userId, "push"))!;
    expect(pushes[0]).toMatchObject({
      message: {
        title: "Pengingat: Resep nasi goreng (Masak Hemat)",
        body: "2 jam sebelum · Rabu, 25 November 2026, 19:00 WIB",
        url: `https://montenku.test/konten/${itemId}`,
        tag: `reminder-${row.reminderSettingId}-once`,
      },
      ttlSeconds: 2 * 3600,
      topic: row.id.replace(/-/g, ""),
    });
    expect(pushes[0]!.topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("pesan push yang sama datang 2x: terkirim 1x", async () => {
    const { deps, pushes } = fakes();
    const { userId } = await setup({ email: false, devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    const message = messageOf((await rowOf(userId, "push"))!);
    expect(await deliver(deps, message, DUE)).toBe("sent");
    expect(await deliver(deps, message, later(DUE, 1))).toBe("skipped");
    expect(pushes).toHaveLength(1);
  });

  it("dua perangkat, satu gagal 5xx: tetap terkirim dan tidak diulang, perangkat yang berhasil menerima 1x", async () => {
    const { userId, devices } = await setup({ email: false, devices: 2 });
    const { deps, pushes } = fakes({ [devices[1]!.endpoint]: "fail" });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    await reconcile(deps, { now: DUE, userId });
    await reconcile(deps, { now: later(DUE, 15), userId });
    expect(await rowOf(userId, "push")).toMatchObject({ status: "sent", attempts: 0 });
    expect(pushes.map((p) => p.endpoint)).toEqual([devices[0]!.endpoint]);
  });

  it("semua perangkat gagal 5xx: kembali pending dan dilempar ulang; percobaan berikutnya terkirim", async () => {
    const { userId, devices } = await setup({ email: false, devices: 1 });
    const behaviour: Record<string, Behaviour> = { [devices[0]!.endpoint]: "fail" };
    const { deps, pushes } = fakes(behaviour);
    await reconcile(deps, { now: DAY_BEFORE, userId });
    const message = messageOf((await rowOf(userId, "push"))!);
    await expect(deliver(deps, message, DUE)).rejects.toThrow("Push 503");
    expect(await rowOf(userId, "push")).toMatchObject({ status: "pending", attempts: 1, lastError: "Push 503 sibuk" });

    behaviour[devices[0]!.endpoint] = "ok";
    expect(await deliver(deps, message, later(DUE, 1))).toBe("sent");
    expect(pushes).toHaveLength(1);
  });

  it("perangkat 410 (sudah berhenti langganan): langganannya dihapus; kalau tidak tersisa, baris dibatalkan", async () => {
    const { userId, devices } = await setup({ email: false, devices: 2 });
    const { deps, pushes } = fakes({ [devices[0]!.endpoint]: "gone", [devices[1]!.endpoint]: "gone" });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    expect(await deliver(deps, messageOf((await rowOf(userId, "push"))!), DUE)).toBe("cancelled");
    expect(await rowOf(userId, "push")).toMatchObject({ status: "cancelled", lastError: "Tidak ada perangkat yang aktif" });
    expect(await db.$count(pushSubscriptions, eq(pushSubscriptions.userId, userId))).toBe(0);
    expect(pushes).toHaveLength(0);
  });

  it("perangkat terakhir dilepas: push yang pending dibatalkan, termasuk yang sudah lewat; email tetap terkirim", async () => {
    const { deps, emails, pushes } = fakes();
    const { userId, devices } = await setup({ devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    expect(await deletePushSubscription(userId, devices[0]!.endpoint)).toBe(true);

    // Next reconcile only after the posting time (12:00 UTC): the row is no longer "wanted" for any reason, so only the
    // "its channel is off" check finds it to cancel. The email row is overdue and goes out late (sweeper safety net).
    await reconcile(deps, { now: later(DUE, 150), userId });
    expect(await rowOf(userId, "push")).toMatchObject({ status: "cancelled" });
    expect(await rowOf(userId, "email")).toMatchObject({ status: "sent" });
    expect(pushes).toHaveLength(0);
    expect(emails).toHaveLength(1);
  });

  it("email dimatikan setelah pesan diantrekan: konsumen tidak mengklaim baris email, push tetap terkirim", async () => {
    const { deps, emails, pushes } = fakes();
    const { userId } = await setup({ devices: 1 });
    await reconcile(deps, { now: DAY_BEFORE, userId });
    // Switched off without a reconcile in between, like a message already on the queue.
    await saveUserSettings(userId, { emailEnabled: false, timezone: "Asia/Jakarta", quiet: null });

    expect(await deliver(deps, messageOf((await rowOf(userId, "email"))!), DUE)).toBe("skipped");
    expect(await deliver(deps, messageOf((await rowOf(userId, "push"))!), DUE)).toBe("sent");
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(1);
  });
});

describe("langganan push per perangkat: isolasi", () => {
  it("perangkat yang dipakai login lain pindah ke pengguna baru; pengguna lama tidak lagi menerima push", async () => {
    const { deps, pushes } = fakes();
    const alice = await setup({ email: false, devices: 1 });
    const bob = await setup({ email: false });
    await reconcile(deps, { now: DAY_BEFORE, userId: alice.userId });

    // Bob signs in on Alice's old browser and turns push on there.
    await savePushSubscription(bob.userId, alice.devices[0]!);
    expect(await hasPushSubscription(alice.userId, alice.devices[0]!.endpoint)).toBe(false);
    expect(await hasPushSubscription(bob.userId, alice.devices[0]!.endpoint)).toBe(true);

    await reconcile(deps, { now: DUE, userId: alice.userId });
    expect(await rowOf(alice.userId, "push")).toMatchObject({ status: "cancelled" });
    expect(pushes).toHaveLength(0);
  });

  it("pengguna lain tidak bisa melepas perangkat orang lain", async () => {
    const alice = await setup({ devices: 1 });
    const bob = await setup();
    expect(await deletePushSubscription(bob.userId, alice.devices[0]!.endpoint)).toBe(false);
    expect(
      await db.$count(pushSubscriptions, and(eq(pushSubscriptions.userId, alice.userId), eq(pushSubscriptions.endpoint, alice.devices[0]!.endpoint))),
    ).toBe(1);
  });
});
