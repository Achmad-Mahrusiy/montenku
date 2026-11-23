import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { contentItems, scheduleExceptions, user } from "@/db/schema";
import { describeWeekly, readWeeklyRrule, scheduleSchema, weeklyRrule, type ScheduleInput } from "@/lib/validation/schedule";
import { archiveContentAccount, createContentAccount } from "@/server/dal/content-accounts";
import { getContentItem, updateContentItem } from "@/server/dal/content-items";
import {
  clearException,
  createSchedule,
  deleteSchedule,
  fillSlot,
  getSchedule,
  listFilledSlots,
  listSchedules,
  setException,
  updateSchedule,
} from "@/server/dal/schedules";

afterAll(() => closeDb());

const alice = `sched-a-${randomUUID()}`;
const bob = `sched-b-${randomUUID()}`;
let aliceAccount: string;
let aliceOther: string;
let bobAccount: string;

const account = (name: string) => ({ name, platform: "tiktok" as const, handle: "h", color: "#e4572e" as const, timezone: "Asia/Jakarta" });
const rule = (accountId: string, overrides: Partial<ScheduleInput> = {}): ScheduleInput => ({
  accountId,
  title: "Upload resep",
  rrule: "FREQ=WEEKLY;BYDAY=TU,FR",
  dtstartLocal: "2026-11-03T19:00",
  ...overrides,
});

beforeAll(async () => {
  await db.insert(user).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);
  aliceAccount = (await createContentAccount(alice, account("Masak Hemat"))).id;
  aliceOther = (await createContentAccount(alice, account("Jalan Pagi"))).id;
  bobAccount = (await createContentAccount(bob, account("Bob"))).id;
});

describe("validasi jadwal mingguan", () => {
  const form = { accountId: randomUUID(), title: " Upload resep ", days: ["FR", "TU"], time: "19:00", startDate: "2026-11-03", endDate: "" };

  it("menyusun RRULE urut Senin-Minggu, tanpa UNTIL kalau tidak berakhir", () => {
    expect(scheduleSchema.parse(form)).toMatchObject({ title: "Upload resep", rrule: "FREQ=WEEKLY;BYDAY=TU,FR", dtstartLocal: "2026-11-03T19:00" });
    expect(weeklyRrule(["FR", "TU"], "2026-12-31")).toBe("FREQ=WEEKLY;BYDAY=TU,FR;UNTIL=20261231T235959");
  });

  it("bisa dibaca balik untuk editor dan dideskripsikan untuk daftar", () => {
    expect(readWeeklyRrule("FREQ=WEEKLY;BYDAY=TU,FR;UNTIL=20261231T235959")).toEqual({ days: ["TU", "FR"], endDate: "2026-12-31" });
    expect(describeWeekly("FREQ=WEEKLY;BYDAY=TU,FR", "2026-11-03T19:00")).toBe("Selasa & Jumat, 19:00");
    expect(describeWeekly("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-11-03T06:30")).toBe("Senin, Rabu & Jumat, 06:30");
  });

  it("menolak tanpa hari, jam mustahil, dan tanggal berakhir sebelum mulai", () => {
    expect(scheduleSchema.safeParse({ ...form, days: [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...form, time: "25:00" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...form, endDate: "2026-11-01" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...form, days: ["XX"] }).success).toBe(false);
  });
});

describe("jadwal milik sendiri", () => {
  it("buat, ubah, hapus; akun yang diarsipkan tidak bisa diberi jadwal baru", async () => {
    const id = await createSchedule(alice, rule(aliceAccount));
    expect((await getSchedule(alice, id!))?.dtstartLocal).toBe("2026-11-03T19:00");

    expect(await updateSchedule(alice, id!, rule(aliceAccount, { title: "Upload resep baru" }))).toBe(true);
    expect((await listSchedules(alice)).find((s) => s.id === id)?.title).toBe("Upload resep baru");

    const archived = (await createContentAccount(alice, account("Lama"))).id;
    await archiveContentAccount(alice, archived);
    expect(await createSchedule(alice, rule(archived))).toBeNull();

    expect(await deleteSchedule(alice, id!)).toBe(true);
    expect(await getSchedule(alice, id!)).toBeNull();
  });

  it("lewati, geser, dan kembalikan satu kemunculan; tanggal karangan ditolak", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount)))!;
    expect(await setException(alice, id, "2026-12-01T19:00", { kind: "skip" })).toBe(true);
    expect(await setException(alice, id, "2026-12-04T19:00", { kind: "move", movedToLocal: "2026-12-05T10:00" })).toBe(true);
    // Changing a skip into a move updates the same row (one exception per occurrence).
    expect(await setException(alice, id, "2026-12-01T19:00", { kind: "move", movedToLocal: "2026-12-02T08:00" })).toBe(true);
    expect((await getSchedule(alice, id))?.exceptions).toEqual(
      expect.arrayContaining([
        { occurrenceKey: "2026-12-01T19:00", kind: "move", movedToLocal: "2026-12-02T08:00" },
        { occurrenceKey: "2026-12-04T19:00", kind: "move", movedToLocal: "2026-12-05T10:00" },
      ]),
    );

    expect(await setException(alice, id, "2026-12-02T19:00", { kind: "skip" })).toBe(false); // Rabu, bukan kemunculan
    expect(await clearException(alice, id, "2026-12-04T19:00")).toBe(true);
    expect((await getSchedule(alice, id))?.exceptions).toHaveLength(1);
  });
});

describe("Isi konten (slot -> item)", () => {
  it("membuat item di jam slot dengan judul jadwal; klik kedua mengembalikan item yang sama", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount)))!;
    const itemId = await fillSlot(alice, id, "2026-11-24T19:00");
    expect(await fillSlot(alice, id, "2026-11-24T19:00")).toBe(itemId);

    const item = await getContentItem(alice, itemId!);
    expect(item).toMatchObject({ title: "Upload resep", status: "idea", scheduleId: id, occurrenceKey: "2026-11-24T19:00" });
    expect(item?.targetAt.toISOString()).toBe("2026-11-24T12:00:00.000Z");
    expect(await listFilledSlots(alice, [id])).toHaveLength(1);
  });

  it("slot yang digeser memakai jam barunya; slot yang dilewati dan tanggal karangan ditolak", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount)))!;
    await setException(alice, id, "2026-11-27T19:00", { kind: "move", movedToLocal: "2026-11-28T10:00" });
    await setException(alice, id, "2026-12-01T19:00", { kind: "skip" });

    const moved = await fillSlot(alice, id, "2026-11-27T19:00");
    expect((await getContentItem(alice, moved!))?.targetAt.toISOString()).toBe("2026-11-28T03:00:00.000Z");
    expect(await fillSlot(alice, id, "2026-12-01T19:00")).toBeNull();
    expect(await fillSlot(alice, id, "2026-11-25T19:00")).toBeNull();
  });

  it("hapus jadwal: item tetap ada tapi lepas dari slot; pindah akun juga melepas slot", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount)))!;
    const a = (await fillSlot(alice, id, "2026-11-24T19:00"))!;
    const b = (await fillSlot(alice, id, "2026-11-27T19:00"))!;

    const detail = (await getContentItem(alice, b))!;
    await updateContentItem(alice, b, {
      title: detail.title,
      description: "",
      accountId: aliceOther,
      status: "idea",
      tags: [],
      targetWallTime: "2026-11-27T19:00",
      deadlines: {},
    });
    expect((await getContentItem(alice, b))?.scheduleId).toBeNull();

    expect(await deleteSchedule(alice, id)).toBe(true);
    expect(await getContentItem(alice, a)).toMatchObject({ title: "Upload resep", scheduleId: null, occurrenceKey: null });
  });
});

// Bob must not reach Alice's schedules, exceptions or slots through any DAL function.
describe("isolasi antar-pengguna", () => {
  it("jadwal: tidak bisa dibaca, diubah, dihapus, diberi pengecualian, atau diisi orang lain", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount, { title: "Milik Alice" })))!;
    await setException(alice, id, "2026-11-24T19:00", { kind: "skip" });

    expect(await getSchedule(bob, id)).toBeNull();
    expect((await listSchedules(bob)).map((s) => s.id)).not.toContain(id);
    expect(await listSchedules(bob, [aliceAccount])).toEqual([]);
    expect(await updateSchedule(bob, id, rule(bobAccount, { title: "Dibajak" }))).toBe(false);
    expect(await setException(bob, id, "2026-11-27T19:00", { kind: "skip" })).toBe(false);
    expect(await clearException(bob, id, "2026-11-24T19:00")).toBe(false);
    expect(await fillSlot(bob, id, "2026-11-27T19:00")).toBeNull();
    expect(await listFilledSlots(bob, [id])).toEqual([]);
    expect(await deleteSchedule(bob, id)).toBe(false);
    expect(await createSchedule(bob, rule(aliceAccount))).toBeNull();

    const after = await getSchedule(alice, id);
    expect(after?.title).toBe("Milik Alice");
    expect(after?.exceptions).toHaveLength(1);
  });

  it("lapisan kedua: database menolak pengecualian atau item yang menunjuk jadwal orang lain", async () => {
    const id = (await createSchedule(alice, rule(aliceAccount)))!;
    await expect(
      db.insert(scheduleExceptions).values({ userId: bob, scheduleId: id, occurrenceKey: "2026-11-24T19:00", kind: "skip" }),
    ).rejects.toThrow();
    await expect(
      db.insert(contentItems).values({
        userId: bob,
        accountId: bobAccount,
        title: "x",
        targetAt: new Date(),
        scheduleId: id,
        occurrenceKey: "2026-11-24T19:00",
      }),
    ).rejects.toThrow();
    // A slot link always has both parts.
    await expect(
      db.insert(contentItems).values({ userId: alice, accountId: aliceAccount, title: "x", targetAt: new Date(), scheduleId: id }),
    ).rejects.toThrow();
    expect(await db.$count(contentItems, eq(contentItems.scheduleId, id))).toBe(0);
  });
});
