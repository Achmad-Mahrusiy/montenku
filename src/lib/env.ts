import { z } from "zod";

// Validate environment variables once, at startup, so a missing secret fails loudly instead of at the first request.
const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET minimal 32 karakter"),
  BETTER_AUTH_URL: z.url(),
});

export const env = envSchema.parse(process.env);
