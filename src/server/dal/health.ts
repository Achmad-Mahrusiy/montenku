import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}
