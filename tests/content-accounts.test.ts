import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { user } from "@/db/schema";
import { contentAccountSchema, type ContentAccountInput } from "@/lib/validation/content-account";
import {
  archiveContentAccount,
  createContentAccount,
  getContentAccount,
  listContentAccounts,
  restoreContentAccount,
  updateContentAccount,
} from "@/server/dal/content-accounts";

afterAll(() => closeDb());

const alice = `user-a-${randomUUID()}`;
const bob = `user-b-${randomUUID()}`;
const input: ContentAccountInput = {
  name: "Masak Hemat",
  platform: "tiktok",
  handle: "masakhemat",
  color: "#e4572e",
  timezone: "Asia/Jakarta",
};

beforeAll(async () => {
  await db.insert(user).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);
});

describe("validasi akun konten", () => {
  it("membuang @ di depan handle dan spasi", () => {
    expect(contentAccountSchema.parse({ ...input, handle: "  @masakhemat " }).handle).toBe("masakhemat");
  });

  it("menolak warna, platform, zona waktu, dan handle yang tidak valid", () => {
    const result = contentAccountSchema.safeParse({
      name: " ",
      platform: "facebook",
      handle: "ada spasi",
      color: "#000000",
      timezone: "Asia/Bandung",
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["name", "platform", "handle", "color", "timezone"]);
  });
});

describe("akun konten milik sendiri", () => {
  it("membuat, mengubah, mengarsipkan, lalu memulihkan", async () => {
    const created = await createContentAccount(alice, input);
    expect(created.userId).toBe(alice);

    expect(await updateContentAccount(alice, created.id, { ...input, name: "Masak Hemat Baru" })).toBe(true);
    expect((await getContentAccount(alice, created.id))?.name).toBe("Masak Hemat Baru");

    expect(await archiveContentAccount(alice, created.id)).toBe(true);
    expect((await getContentAccount(alice, created.id))?.archivedAt).toBeInstanceOf(Date);
    expect(await archiveContentAccount(alice, created.id)).toBe(false);

    expect(await restoreContentAccount(alice, created.id)).toBe(true);
    expect((await getContentAccount(alice, created.id))?.archivedAt).toBeNull();
  });

  it("menampilkan akun aktif dulu, lalu yang diarsipkan", async () => {
    const owner = `user-c-${randomUUID()}`;
    await db.insert(user).values({ id: owner, name: "C", email: `${owner}@example.com` });
    const first = await createContentAccount(owner, { ...input, name: "Lama" });
    await createContentAccount(owner, { ...input, name: "Baru" });
    await archiveContentAccount(owner, first.id);

    expect((await listContentAccounts(owner)).map((a) => a.name)).toEqual(["Baru", "Lama"]);
  });
});

// Bob must not be able to see or change anything Alice owns, through any DAL function.
describe("isolasi antar-pengguna", () => {
  it("pengguna lain tidak bisa membaca, mengubah, mengarsipkan, atau memulihkan", async () => {
    const owned = await createContentAccount(alice, { ...input, name: "Milik Alice" });

    expect((await listContentAccounts(bob)).map((a) => a.id)).not.toContain(owned.id);
    expect(await getContentAccount(bob, owned.id)).toBeNull();
    expect(await updateContentAccount(bob, owned.id, { ...input, name: "Dibajak" })).toBe(false);
    expect(await archiveContentAccount(bob, owned.id)).toBe(false);

    await archiveContentAccount(alice, owned.id);
    expect(await restoreContentAccount(bob, owned.id)).toBe(false);

    const after = await getContentAccount(alice, owned.id);
    expect(after?.name).toBe("Milik Alice");
    expect(after?.archivedAt).toBeInstanceOf(Date);
  });

  it("id yang tidak ada mengembalikan kosong, bukan error", async () => {
    const missing = randomUUID();
    expect(await getContentAccount(alice, missing)).toBeNull();
    expect(await updateContentAccount(alice, missing, input)).toBe(false);
  });
});
