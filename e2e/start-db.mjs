// Throwaway Postgres for the Playwright tests (D-038). Started by playwright.config.ts as the first webServer:
// Playwright runs webServers before globalSetup, so the database cannot be started there.
// It answers on the readiness port only after every migration ran, so Playwright waits for a ready database.
import { readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const DB_PORT = 55434;
const READY_PORT = 55435;
const url = `postgresql://postgres:postgres@localhost:${DB_PORT}/postgres`;

const pg = new EmbeddedPostgres({
  // Outside the project (OneDrive never syncs it); persistent: false deletes it when the database stops.
  databaseDir: join(tmpdir(), `montenku-e2e-postgres-${process.pid}`),
  port: DB_PORT,
  user: "postgres",
  password: "postgres",
  persistent: false,
  // Same flags as the unit tests (tests/helpers/global-setup.ts): UTF-8 like Supabase, no orphaned I/O workers on Windows.
  postgresFlags: ["-c", "io_method=sync"],
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

// A forced stop (Ctrl+C, a killed test run) leaves the old data folder behind, about 40 MB each. The port is fixed, so
// only one E2E database runs at a time: once this one starts, older folders belong to nobody.
function removeStaleFolders() {
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith("montenku-e2e-postgres-") && name !== `montenku-e2e-postgres-${process.pid}`) {
      rmSync(join(tmpdir(), name), { recursive: true, force: true });
    }
  }
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

removeStaleFolders();
await pg.initialise();
await pg.start();
const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
await client.end();

createServer((_req, res) => res.end("ok")).listen(READY_PORT, "localhost");
console.log(`E2E database ready on port ${DB_PORT}`);
