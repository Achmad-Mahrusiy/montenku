import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { contentItems, itemStageDeadlines, notes, user } from "@/db/schema";
import { contentItemSchema, type ContentItemInput } from "@/lib/validation/content-item";
import { archiveContentAccount, createContentAccount } from "@/server/dal/content-accounts";
import {
  createContentItem,
  createNote,
  deleteContentItem,
  deleteNote,
  getContentItem,
  listDeadlines,
  listLatePostings,
  listContentItems,
  listNotes,
  updateContentItem,
  updateNote,
} from "@/server/dal/content-items";

afterAll(() => closeDb());

const alice = `item-a-${randomUUID()}`;
const bob = `item-b-${randomUUID()}`;
let aliceJakarta: string;
let aliceTokyo: string;
let bobAccount: string;

const base = (accountId: string, overrides: Partial<ContentItemInput> = {}): ContentItemInput => ({
  title: "Resep nasi goreng 10 ribu",
  description: "",
  accountId,
  status: "idea",
  tags: [],
  targetWallTime: "2026-11-23T19:00",
  deadlines: {},
  ...overrides,
});

const account = (name: string, timezone: string) => ({
  name,
  platform: "tiktok" as const,
  handle: name.toLowerCase(),
  color: "#e4572e" as const,
  timezone,
});

beforeAll(async () => {
  await db.insert(user).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);
  aliceJakarta = (await createContentAccount(alice, account("Jakarta", "Asia/Jakarta"))).id;
  aliceTokyo = (await createContentAccount(alice, account("Tokyo", "Asia/Tokyo"))).id;
  bobAccount = (await createContentAccount(bob, account("Bob", "Asia/Jakarta"))).id;
});

describe("validasi item konten", () => {
  const form = {
    title: " Judul ",
    accountId: randomUUID(),
    targetDate: "2026-11-23",
    targetTime: "19:00",
    status: "idea",
    tags: "resep, hemat, Resep , ,anak kos",
    deadlines: { script: "", production: "2026-11-21T10:00" },
  };

  it("menggabungkan tanggal dan jam, merapikan judul dan tag", () => {
    const parsed = contentItemSchema.parse(form);
    expect(parsed.title).toBe("Judul");
    expect(parsed.targetWallTime).toBe("2026-11-23T19:00");
    expect(parsed.tags).toEqual(["resep", "hemat", "anak kos"]);
    expect(parsed.deadlines).toEqual({ production: "2026-11-21T10:00" });
  });

  it("tanggal target wajib (D-021) dan tanggal mustahil ditolak", () => {
    expect(contentItemSchema.safeParse({ ...form, targetDate: "" }).success).toBe(false);
    expect(contentItemSchema.safeParse({ ...form, targetDate: "2026-02-30" }).success).toBe(false);
  });

  it("menolak status, tenggat, dan jumlah tag yang tidak valid", () => {
    expect(contentItemSchema.safeParse({ ...form, status: "viral" }).success).toBe(false);
    expect(contentItemSchema.safeParse({ ...form, deadlines: { script: "besok" } }).success).toBe(false);
    const elevenTags = Array.from({ length: 11 }, (_, i) => `t${i}`).join(",");
    expect(contentItemSchema.safeParse({ ...form, tags: elevenTags }).success).toBe(false);
  });
});

describe("item konten milik sendiri", () => {
  it("menyimpan jam target dan tenggat dalam zona waktu akun", async () => {
    const created = await createContentItem(
      alice,
      base(aliceJakarta, { deadlines: { script: "2026-11-20T09:00", editing: "2026-11-23T15:00" } }),
    );
    expect(created?.targetAt.toISOString()).toBe("2026-11-23T12:00:00.000Z"); // 19:00 WIB

    const detail = await getContentItem(alice, created!.id);
    expect(detail?.account.name).toBe("Jakarta");
    expect(detail?.deadlines.map((d) => [d.stage, d.dueAt.toISOString()])).toEqual([
      ["script", "2026-11-20T02:00:00.000Z"],
      ["editing", "2026-11-23T08:00:00.000Z"],
    ]);
  });

  it("pindah akun menghitung ulang jam memakai zona akun baru dan mengganti tenggat", async () => {
    const created = await createContentItem(alice, base(aliceJakarta, { deadlines: { script: "2026-11-20T09:00" } }));
    expect(await updateContentItem(alice, created!.id, base(aliceTokyo, { status: "script" }))).toBe(true);

    const detail = await getContentItem(alice, created!.id);
    expect(detail?.targetAt.toISOString()).toBe("2026-11-23T10:00:00.000Z"); // 19:00 JST
    expect(detail?.status).toBe("script");
    expect(detail?.deadlines).toEqual([]);
  });

  it("akun yang diarsipkan: tidak bisa diberi item baru, item lamanya tetap bisa diubah", async () => {
    const archived = (await createContentAccount(alice, account("Lama", "Asia/Jakarta"))).id;
    const existing = await createContentItem(alice, base(archived));
    await archiveContentAccount(alice, archived);

    expect(await createContentItem(alice, base(archived))).toBeNull();
    expect(await updateContentItem(alice, existing!.id, base(archived, { title: "Masih bisa diubah" }))).toBe(true);

    const other = await createContentItem(alice, base(aliceJakarta));
    expect(await updateContentItem(alice, other!.id, base(archived))).toBe(false);
  });

  it("hapus item ikut menghapus tenggat dan catatannya", async () => {
    const created = await createContentItem(alice, base(aliceJakarta, { deadlines: { ready: "2026-11-23T18:00" } }));
    await createNote(alice, created!.id, "Hook 3 detik pertama");
    expect(await deleteContentItem(alice, created!.id)).toBe(true);

    expect(await db.$count(itemStageDeadlines, eq(itemStageDeadlines.itemId, created!.id))).toBe(0);
    expect(await db.$count(notes, eq(notes.itemId, created!.id))).toBe(0);
  });

  it("daftar kalender: hanya rentang [from, to), urut waktu, bisa difilter per akun", async () => {
    const owner = `item-c-${randomUUID()}`;
    await db.insert(user).values({ id: owner, name: "C", email: `${owner}@example.com` });
    const a = (await createContentAccount(owner, account("A", "Asia/Jakarta"))).id;
    const b = (await createContentAccount(owner, account("B", "Asia/Jakarta"))).id;
    await createContentItem(owner, base(a, { title: "Akhir", targetWallTime: "2026-11-30T20:00" }));
    await createContentItem(owner, base(b, { title: "Awal", targetWallTime: "2026-11-01T07:00" }));
    await createContentItem(owner, base(a, { title: "Desember", targetWallTime: "2026-12-01T07:00" }));

    const november = { from: new Date("2026-10-31T17:00:00Z"), to: new Date("2026-11-30T17:00:00Z") };
    expect((await listContentItems(owner, november)).map((i) => i.title)).toEqual(["Awal", "Akhir"]);
    expect((await listContentItems(owner, { ...november, accountIds: [a] })).map((i) => i.title)).toEqual(["Akhir"]);
  });
});

describe("catatan per item", () => {
  it("banyak catatan per item, urut dibuat, bisa diubah dan dihapus", async () => {
    const item = await createContentItem(alice, base(aliceJakarta));
    const first = await createNote(alice, item!.id, "Satu");
    await createNote(alice, item!.id, "Dua");
    expect((await listNotes(alice, item!.id)).map((n) => n.bodyMd)).toEqual(["Satu", "Dua"]);

    expect(await updateNote(alice, first!.id, "Satu (revisi)")).toBe(true);
    expect(await deleteNote(alice, first!.id)).toBe(true);
    expect((await listNotes(alice, item!.id)).map((n) => n.bodyMd)).toEqual(["Dua"]);
  });
});

// Bob must not reach Alice's items or notes through any DAL function.
describe("isolasi antar-pengguna", () => {
  it("item: tidak bisa dibaca, diubah, dipindah, dihapus, atau dibuat di akun orang lain", async () => {
    const owned = await createContentItem(alice, base(aliceJakarta, { title: "Milik Alice" }));
    const range = { from: new Date("2026-01-01Z"), to: new Date("2027-01-01Z") };

    expect(await getContentItem(bob, owned!.id)).toBeNull();
    expect((await listContentItems(bob, range)).map((i) => i.id)).not.toContain(owned!.id);
    expect((await listContentItems(bob, { ...range, accountIds: [aliceJakarta] })).length).toBe(0);
    expect(await updateContentItem(bob, owned!.id, base(bobAccount, { title: "Dibajak" }))).toBe(false);
    expect(await deleteContentItem(bob, owned!.id)).toBe(false);
    expect(await createContentItem(bob, base(aliceJakarta))).toBeNull();

    const bobItem = await createContentItem(bob, base(bobAccount));
    expect(await updateContentItem(bob, bobItem!.id, base(aliceJakarta))).toBe(false);

    expect((await getContentItem(alice, owned!.id))?.title).toBe("Milik Alice");
  });

  it("catatan: tidak bisa dibaca, ditambah, diubah, atau dihapus di item orang lain", async () => {
    const item = await createContentItem(alice, base(aliceJakarta));
    const note = await createNote(alice, item!.id, "Rahasia Alice");

    expect(await listNotes(bob, item!.id)).toEqual([]);
    expect(await createNote(bob, item!.id, "Titipan Bob")).toBeNull();
    expect(await updateNote(bob, note!.id, "Diubah Bob")).toBe(false);
    expect(await deleteNote(bob, note!.id)).toBe(false);
    expect((await listNotes(alice, item!.id)).map((n) => n.bodyMd)).toEqual(["Rahasia Alice"]);
  });

  it("lapisan kedua: database menolak item atau catatan yang menunjuk milik orang lain, walau tanpa DAL", async () => {
    await expect(
      db.insert(contentItems).values({ userId: bob, accountId: aliceJakarta, title: "x", targetAt: new Date() }),
    ).rejects.toThrow();

    const item = await createContentItem(alice, base(aliceJakarta));
    await expect(db.insert(notes).values({ userId: bob, itemId: item!.id, bodyMd: "x" })).rejects.toThrow();
    await expect(
      db.insert(itemStageDeadlines).values({ userId: bob, itemId: item!.id, stage: "script", dueAt: new Date() }),
    ).rejects.toThrow();
  });
});

describe("query dashboard: tenggat dan posting terlambat", () => {
  // A year no other test uses, so the range queries only see these rows.
  const range = { from: new Date("2031-01-01T00:00:00Z"), to: new Date("2031-02-01T00:00:00Z") };

  it("tenggat dalam rentang beserta status dan akunnya; milik pengguna lain tidak ikut", async () => {
    const item = await createContentItem(alice, base(aliceJakarta, { targetWallTime: "2031-01-20T19:00", deadlines: { script: "2031-01-10T10:00" } }));
    await createContentItem(bob, base(bobAccount, { targetWallTime: "2031-01-20T19:00", deadlines: { script: "2031-01-10T10:00" } }));

    expect(await listDeadlines(alice, range)).toEqual([
      expect.objectContaining({ itemId: item!.id, status: "idea", stage: "script", dueAt: new Date("2031-01-10T03:00:00Z"), account: expect.objectContaining({ name: "Jakarta" }) }),
    ]);
    expect((await listDeadlines(bob, range)).map((d) => d.itemId)).not.toContain(item!.id);
  });

  it("posting yang lewat tanpa status Terposting; yang terposting dan milik orang lain tidak ikut", async () => {
    const late = await createContentItem(alice, base(aliceJakarta, { targetWallTime: "2031-01-15T19:00", status: "ready" }));
    await createContentItem(alice, base(aliceJakarta, { targetWallTime: "2031-01-15T19:00", status: "posted" }));
    const bobs = await createContentItem(bob, base(bobAccount, { targetWallTime: "2031-01-15T19:00" }));

    const ids = (await listLatePostings(alice, range)).map((p) => p.itemId);
    expect(ids).toContain(late!.id);
    expect(ids).not.toContain(bobs!.id);
    expect((await listLatePostings(alice, range)).every((p) => p.status !== "posted")).toBe(true);
  });
});
