import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

// Runs once before all tests: start an in-memory Postgres (PGlite) that speaks the normal Postgres protocol,
// so the app's own postgres-js client connects to it unchanged. Every run starts from an empty database.
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL untuk test belum diatur di vitest.config.ts");

  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: Number(new URL(url).port), maxConnections: 10 });
  await server.start();

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();

  return async () => {
    await server.stop();
    await pg.close();
  };
}
