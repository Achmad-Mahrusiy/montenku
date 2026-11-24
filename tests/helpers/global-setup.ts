import { readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
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

  // A Postgres left over from an interrupted run keeps the port; fail with a clear message instead of hanging.
  const free = await new Promise<boolean>((resolve) => {
    const probe = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(Number(port), "127.0.0.1");
  });
  if (!free) {
    throw new Error(
      `Port ${port} masih dipakai, biasanya Postgres test sisa run sebelumnya. Tutup postgres.exe dari node_modules/@embedded-postgres (Task Manager), lalu jalankan npm test lagi.`,
    );
  }

  // Outside the project folder so OneDrive never syncs it, and unique per run so a new run never touches a folder
  // an old Postgres still uses. persistent: false deletes it when the database stops.
  const databaseDir = join(tmpdir(), `montenku-test-postgres-${process.pid}`);
  // The port is free, so no other test database is running: folders left by a forced stop (about 40 MB each) can go.
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith("montenku-test-postgres-")) rmSync(join(tmpdir(), name), { recursive: true, force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: Number(port),
    user: username,
    password,
    persistent: false,
    // Postgres 18's I/O worker processes survive the forced stop on Windows and keep the port; sync I/O has none.
    postgresFlags: ["-c", "io_method=sync"],
    // Like Supabase. Without this, initdb takes the Windows code page (WIN1252), which rejects emoji in titles.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
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
