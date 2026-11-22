import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env")) process.loadEnvFile();

// Migrations use the direct/session connection, never the transaction pooler.
const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL belum diisi. Salin .env.example ke .env.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
