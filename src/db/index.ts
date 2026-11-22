import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse one client across hot reloads in dev; otherwise every file save opens a new connection pool.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// prepare: false because Supabase's transaction pooler (port 6543) does not support prepared statements.
const client = globalForDb.pgClient ?? postgres(env.DATABASE_URL, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle({ client, schema });
export const closeDb = () => client.end();
