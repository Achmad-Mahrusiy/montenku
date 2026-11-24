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
    // Tests use a throwaway local Postgres started by global-setup, never your Supabase database.
    // Fake secrets for the cron route and mailer tests; Resend itself is never called (fetch is stubbed).
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55432/postgres",
      CRON_SECRET: "test-cron-secret-0123456789",
      RESEND_API_KEY: "re_test_key",
      // Empty on purpose: your .env may hold real VAPID keys, and tests must never reach a push service.
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      VAPID_SUBJECT: "",
    },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    // Stopping Postgres on Windows can take a while on a busy laptop; the default 10s left it running once.
    teardownTimeout: 30_000,
  },
});
