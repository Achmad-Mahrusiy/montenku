import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/kalender/[file]/route";
import { closeDb, db } from "@/db";
import { user } from "@/db/schema";
import { buildIcs, escapeText, foldLine } from "@/lib/ics";
import { instantToWallTime } from "@/lib/time";
import { createContentAccount, setFeedToken } from "@/server/dal/content-accounts";
import { createContentItem } from "@/server/dal/content-items";
import { createSchedule } from "@/server/dal/schedules";

afterAll(() => closeDb());

describe("format .ics (RFC 5545)", () => {
  it("escape teks: backslash, titik koma, koma, baris baru", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("baris panjang dilipat per 75 byte tanpa memotong emoji, dan bisa disambung lagi", () => {
    const line = `SUMMARY:${"Resep 🍳 hemat ".repeat(12)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    // No half emoji anywhere: every part is valid text on its own.
    for (const part of parts) expect(part).not.toContain("�");
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("setiap baris diakhiri CRLF, waktu dalam UTC", () => {
    const ics = buildIcs("Montenku · Uji", [{ uid: "x@montenku", start: new Date("2031-03-07T12:00:00Z"), summary: "A", description: "B", url: "http://localhost/konten/x" }], new Date("2031-03-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("DTSTART:20310307T120000Z\r\n");
    expect(ics).toContain("DTSTAMP:20310301T000000Z\r\n");
  });
});

const alice = `feed-a-${randomUUID()}`;
const bob = `feed-b-${randomUUID()}`;
const token = () => randomBytes(32).toString("base64url");
const fetchFeed = (file: string) => GET(new Request(`http://localhost/api/kalender/${file}`), { params: Promise.resolve({ file }) });
/** Unfolded feed text, so long titles can be searched for. */
const feedText = async (t: string) => (await (await fetchFeed(`${t}.ics`)).text()).replace(/\r\n /g, "");
const uids = (ics: string) => [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]!.trim()).sort();

const account = (name: string) => ({ name, platform: "tiktok" as const, handle: name.toLowerCase(), color: "#e4572e" as const, timezone: "Asia/Jakarta" });
/** Wall-clock time in Jakarta some days from now, so everything falls inside the feed window. */
const inDays = (days: number) => instantToWallTime(new Date(Date.now() + days * 86_400_000), "Asia/Jakarta").slice(0, 16);

let aliceMain: string;
let aliceOther: string;
let bobAccount: string;
let aliceToken: string;
let bobToken: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.insert(user).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);
  aliceMain = (await createContentAccount(alice, account("Masak"))).id;
  aliceOther = (await createContentAccount(alice, account("Jalan"))).id;
  bobAccount = (await createContentAccount(bob, account("Bob"))).id;

  const item = (userId: string, accountId: string, title: string, extra: object = {}) =>
    createContentItem(userId, { title, description: "", accountId, status: "idea", tags: [], targetWallTime: inDays(3), deadlines: {}, ...extra });
  ids.main = (await item(alice, aliceMain, "Resep 🍳, murah; enak", { deadlines: { script: inDays(1) } }))!.id;
  // Status "editing": the script and production deadlines are met, the editing deadline is still open.
  ids.editing = (await item(alice, aliceMain, "Vlog pasar", { status: "editing", deadlines: { script: inDays(1), editing: inDays(2) } }))!.id;
  // Has a deadline too, so a missing account filter on deadlines would leak it into the feed.
  ids.other = (await item(alice, aliceOther, "Akun lain milik Alice", { deadlines: { script: inDays(1) } }))!.id;
  ids.bob = (await item(bob, bobAccount, "Rahasia Bob"))!.id;
  ids.schedule = (await createSchedule(alice, { accountId: aliceMain, title: "Upload Jumat", rrule: "FREQ=WEEKLY;BYDAY=FR", dtstartLocal: inDays(0) }))!;

  aliceToken = token();
  bobToken = token();
  expect(await setFeedToken(alice, aliceMain, aliceToken)).toBe(true);
  expect(await setFeedToken(bob, bobAccount, bobToken)).toBe(true);
});

describe("feed .ics per akun konten (D-035)", () => {
  it("berisi posting, slot kosong, dan tenggat yang belum selesai dari akun itu saja", async () => {
    const response = await fetchFeed(`${aliceToken}.ics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const ics = await feedText(aliceToken);

    expect(ics).toContain("X-WR-CALNAME:Montenku · Masak");
    expect(ics).toContain(`UID:item-${ids.main}@montenku`);
    expect(ics).toContain("SUMMARY:Resep 🍳\\, murah\\; enak");
    expect(ics).toContain(`UID:deadline-${ids.main}-script@montenku`);
    expect(ics).toMatch(new RegExp(`UID:slot-${ids.schedule}:`));
    expect(ics).toContain("SUMMARY:Slot kosong: Upload Jumat");
    // Met deadlines are left out, the open one stays.
    expect(ics).not.toContain(`UID:deadline-${ids.editing}-script@montenku`);
    expect(ics).toContain(`UID:deadline-${ids.editing}-editing@montenku`);
    // Alice's other account and Bob's data never appear.
    expect(ics).not.toContain(ids.other);
    expect(ics).not.toContain(ids.bob);
    expect(ics).not.toContain("Rahasia Bob");
  });

  it("UID sama di setiap pengambilan, supaya aplikasi kalender tidak menggandakan acara", async () => {
    expect(uids(await feedText(aliceToken))).toEqual(uids(await feedText(aliceToken)));
  });

  it("token Bob hanya memberi data Bob", async () => {
    const ics = await feedText(bobToken);
    expect(ics).toContain("Rahasia Bob");
    expect(ics).not.toContain(ids.main);
    expect(ics).not.toContain("Masak");
  });

  it("pengguna lain tidak bisa mengubah atau mematikan tautan akun orang lain", async () => {
    expect(await setFeedToken(bob, aliceMain, token())).toBe(false);
    expect(await setFeedToken(bob, aliceMain, null)).toBe(false);
    expect((await fetchFeed(`${aliceToken}.ics`)).status).toBe(200);
  });

  it("tautan baru mematikan yang lama; tautan yang dimatikan memberi 404", async () => {
    const old = aliceToken;
    aliceToken = token();
    await setFeedToken(alice, aliceMain, aliceToken);
    expect((await fetchFeed(`${old}.ics`)).status).toBe(404);
    expect((await fetchFeed(`${aliceToken}.ics`)).status).toBe(200);

    await setFeedToken(alice, aliceMain, null);
    expect((await fetchFeed(`${aliceToken}.ics`)).status).toBe(404);
  });

  it("alamat yang salah bentuk atau tidak dikenal memberi 404 yang sama", async () => {
    for (const file of ["abc.ics", aliceToken, `${token()}.ics`, `${aliceToken.slice(1)}!.ics`, `../${aliceToken}.ics`]) {
      expect((await fetchFeed(file)).status, file).toBe(404);
    }
  });

  it("setelah akun Montenku dihapus, tautannya memberi 404", async () => {
    await db.delete(user).where(eq(user.id, bob));
    expect((await fetchFeed(`${bobToken}.ics`)).status).toBe(404);
  });
});
