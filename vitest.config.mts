import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile();

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/helpers/global-setup.ts"],
    // Tests use an in-memory PGlite database started by global-setup, never your Supabase database.
    env: { DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55432/postgres" },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
