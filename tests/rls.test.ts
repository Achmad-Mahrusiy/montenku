import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";

afterAll(() => closeDb());

// Supabase exposes every table in `public` through its Data API. RLS with no policies means "deny everyone"
// except our server, which connects as the table owner. These checks fail as soon as a new table forgets it.
describe("RLS deny-all di schema public", () => {
  it("menemukan tabel-tabel kita (pemeriksaan tidak kosong)", async () => {
    const rows = await db.execute<{ name: string }>(
      sql`select tablename as name from pg_tables where schemaname = 'public'`,
    );
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(["user", "session", "account", "verification", "content_accounts"]),
    );
  });

  it("setiap tabel public mengaktifkan RLS", async () => {
    const rows = await db.execute<{ name: string }>(
      sql`select tablename as name from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("tidak ada policy di schema public (deny-all)", async () => {
    const rows = await db.execute<{ name: string }>(
      sql`select policyname as name from pg_policies where schemaname = 'public'`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});
