import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import {
  account,
  contentAccounts,
  contentItems,
  itemStageDeadlines,
  notes,
  reminderSettings,
  reminders,
  scheduleExceptions,
  schedules,
  session,
  user,
  userSettings,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { toAuthErrorMessage } from "@/lib/auth-errors";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { createContentAccount } from "@/server/dal/content-accounts";
import { createContentItem, createNote } from "@/server/dal/content-items";
import { addReminderSetting } from "@/server/dal/reminder-settings";
import { createSchedule, setException } from "@/server/dal/schedules";
import { saveUserSettings } from "@/server/dal/user-settings";

afterAll(() => closeDb());

const password = "kata-sandi-hapus-123";

/** A signed-up user with a row in every table of ours, plus the cookie header of their session. */
async function userWithEverything(email: string) {
  const { headers, response } = await auth.api.signUpEmail({ body: { name: "Hapus", email, password }, returnHeaders: true });
  const userId = response.user.id;
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  await saveUserSettings(userId, { emailEnabled: true, timezone: "Asia/Jakarta", quiet: { start: "22:00", end: "07:00" } });
  const accountId = (await createContentAccount(userId, { name: "Masak Hemat", platform: "tiktok", handle: "mh", color: "#e4572e", timezone: "Asia/Jakarta" })).id;
  const item = (await createContentItem(userId, {
    title: "Resep",
    description: "",
    accountId,
    status: "idea",
    tags: [],
    targetWallTime: "2031-03-07T19:00",
    deadlines: { script: "2031-03-05T10:00" },
  }))!;
  await createNote(userId, item.id, "Hook 3 detik");
  const scheduleId = (await createSchedule(userId, { accountId, title: "Upload", rrule: "FREQ=WEEKLY;BYDAY=FR", dtstartLocal: "2031-03-07T19:00" }))!;
  expect(await setException(userId, scheduleId, "2031-03-14T19:00", { kind: "skip" })).toBe(true);
  await addReminderSetting(userId, { scheduleId }, 60);
  await addReminderSetting(userId, { itemId: item.id }, 120);
  const [setting] = await db.select().from(reminderSettings).where(eq(reminderSettings.itemId, item.id));
  await db.insert(reminders).values({
    userId,
    reminderSettingId: setting!.id,
    occurrenceKey: "once",
    targetAt: item.targetAt,
    sendAt: new Date(item.targetAt.getTime() - 120 * 60_000),
  });
  return { userId, headers: new Headers({ cookie }) };
}

/** Rows that still belong to the user, per table. */
async function rowsLeft(userId: string) {
  const byUser = [session, account, userSettings, contentAccounts, contentItems, itemStageDeadlines, notes, schedules, scheduleExceptions, reminderSettings, reminders] as const;
  const counts = await Promise.all(byUser.map((table) => db.$count(table, eq(table.userId, userId))));
  return { user: await db.$count(user, eq(user.id, userId)), tables: counts.reduce((a, b) => a + b, 0), perTable: counts };
}

describe("hapus akun (D-034)", () => {
  it("kata sandi benar: pengguna dan semua datanya terhapus, pengguna lain tidak tersentuh", async () => {
    const alice = await userWithEverything("hapus-alice@example.com");
    const bob = await userWithEverything("hapus-bob@example.com");
    // Every table really had a row, so "0 left" below means the cascade reached it.
    expect((await rowsLeft(alice.userId)).perTable.every((n) => n > 0)).toBe(true);
    const bobBefore = await rowsLeft(bob.userId);

    await auth.api.deleteUser({ body: { password }, headers: alice.headers });

    expect(await rowsLeft(alice.userId)).toEqual({ user: 0, tables: 0, perTable: Array(11).fill(0) });
    expect(await rowsLeft(bob.userId)).toEqual(bobBefore);
  });

  it("kata sandi salah: ditolak dengan pesan Indonesia, tidak ada yang terhapus", async () => {
    const carol = await userWithEverything("hapus-carol@example.com");
    const before = await rowsLeft(carol.userId);
    let error: unknown;
    try {
      await auth.api.deleteUser({ body: { password: "bukan-kata-sandinya" }, headers: carol.headers });
    } catch (e) {
      error = e;
    }
    expect(toAuthErrorMessage(error)).toBe("Kata sandi salah.");
    expect(await rowsLeft(carol.userId)).toEqual(before);
  });

  it("endpoint HTTP hapus akun dan cek kata sandi ditutup (hanya lewat Server Action yang dibatasi)", async () => {
    const dave = await userWithEverything("hapus-dave@example.com");
    for (const path of ["delete-user", "verify-password"]) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: dave.headers.get("cookie") ?? "" },
          body: JSON.stringify({ password }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
    expect((await rowsLeft(dave.userId)).user).toBe(1);
  });

  it("konfirmasi wajib HAPUS (huruf besar), kata sandi wajib diisi", () => {
    expect(deleteAccountSchema.safeParse({ confirm: " HAPUS ", password: "x" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirm: "hapus", password: "x" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirm: "", password: "x" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirm: "HAPUS", password: "" }).success).toBe(false);
  });
});
