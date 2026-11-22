import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

// Runs once before all tests: start a real, throwaway Postgres (no Docker) and apply every migration,
// so tests talk to the same kind of database as Supabase through the app's own postgres-js client.
// See DECISIONS.md D-013.
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL untuk test belum diatur di vitest.config.mts");
  const { port, username, password } = new URL(url);

  // Outside the project folder so OneDrive never syncs it; removed again when tests finish.
  const databaseDir = join(tmpdir(), "montenku-test-postgres");
  rmSync(databaseDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: Number(port),
    user: username,
    password,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();

  return async () => {
    await pg.stop();
  };
}
