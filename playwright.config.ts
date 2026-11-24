import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the main flows (D-038) against the built app (`next start`), the same way locally and in CI.
// Run with `npm run test:e2e` (builds first). The app talks only to a throwaway Postgres; every outside service is
// switched off below, because Next would otherwise fill missing keys from your .env (Supabase, Upstash, Resend, VAPID).

const APP = "http://localhost:3200";
const DATABASE_URL = "postgresql://postgres:postgres@localhost:55434/postgres";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: APP, locale: "id-ID", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/start-db.mjs",
      url: "http://localhost:55435",
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    },
    {
      command: "npx next start -p 3200",
      url: `${APP}/masuk`,
      // Never reuse a server already on this port: it could be pointed at your real database.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL,
        DIRECT_URL: DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
        BETTER_AUTH_URL: APP,
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        RESEND_API_KEY: "",
        CRON_SECRET: "",
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        VAPID_SUBJECT: "",
        VERCEL: "",
        VERCEL_ENV: "",
      },
    },
  ],
});
