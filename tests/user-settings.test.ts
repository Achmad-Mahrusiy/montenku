import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { user, userSettings } from "@/db/schema";
import { userSettingsSchema } from "@/lib/validation/user-settings";
import { DEFAULT_SETTINGS, getUserSettings, saveUserSettings } from "@/server/dal/user-settings";

afterAll(() => closeDb());

async function newUser() {
  const id = `set-${randomUUID()}`;
  await db.insert(user).values({ id, name: "Uji", email: `${id}@example.com` });
  return id;
}

describe("user settings DAL", () => {
  it("tanpa baris: nilai bawaan (email nyala, Asia/Jakarta, tanpa jam senyap)", async () => {
    expect(await getUserSettings(await newUser())).toEqual(DEFAULT_SETTINGS);
  });

  it("menyimpan lalu mengubah (upsert); jam dibaca kembali sebagai HH:mm", async () => {
    const id = await newUser();
    await saveUserSettings(id, { emailEnabled: false, timezone: "Asia/Makassar", quiet: { start: "22:00", end: "07:00" } });
    expect(await getUserSettings(id)).toEqual({ emailEnabled: false, timezone: "Asia/Makassar", quiet: { start: "22:00", end: "07:00" } });
    await saveUserSettings(id, DEFAULT_SETTINGS);
    expect(await getUserSettings(id)).toEqual(DEFAULT_SETTINGS);
  });

  it("pengaturan satu pengguna tidak mengubah pengguna lain", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await saveUserSettings(alice, { ...DEFAULT_SETTINGS, emailEnabled: false });
    expect((await getUserSettings(bob)).emailEnabled).toBe(true);
  });

  it("database menolak jam senyap setengah terisi atau mulai sama dengan selesai", async () => {
    const id = await newUser();
    await expect(db.insert(userSettings).values({ userId: id, quietStart: "22:00" })).rejects.toThrow();
    await expect(db.insert(userSettings).values({ userId: id, quietStart: "22:00", quietEnd: "22:00" })).rejects.toThrow();
  });
});

describe("userSettingsSchema", () => {
  const base = { emailEnabled: true, timezone: "Asia/Jakarta", quietEnabled: true, quietStart: "22:00", quietEnd: "07:00" };

  it("jam senyap nyala: jam wajib valid dan tidak sama", () => {
    expect(userSettingsSchema.parse(base)).toEqual({ emailEnabled: true, timezone: "Asia/Jakarta", quiet: { start: "22:00", end: "07:00" } });
    expect(userSettingsSchema.safeParse({ ...base, quietStart: "" }).success).toBe(false);
    expect(userSettingsSchema.safeParse({ ...base, quietEnd: "24:00" }).success).toBe(false);
    expect(userSettingsSchema.safeParse({ ...base, quietEnd: "22:00" }).success).toBe(false);
  });

  it("jam senyap mati: jam diabaikan dan disimpan sebagai null", () => {
    expect(userSettingsSchema.parse({ ...base, quietEnabled: false, quietStart: "", quietEnd: "" }).quiet).toBeNull();
  });

  it("zona waktu harus dikenal", () => {
    expect(userSettingsSchema.safeParse({ ...base, timezone: "Mars/Olympus" }).success).toBe(false);
  });
});
