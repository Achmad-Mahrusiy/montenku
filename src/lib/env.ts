import { z } from "zod";

// An empty line in .env ("KEY=") counts as not set.
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

// Validate environment variables once, at startup, so a missing secret fails loudly instead of at the first request.
const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET minimal 32 karakter"),
    BETTER_AUTH_URL: z.url(),
    UPSTASH_REDIS_REST_URL: optional(z.url()),
    UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
    VERCEL_ENV: optional(z.string()),
  })
  .superRefine((value, ctx) => {
    // Rate limiting may be off on your laptop, never on the live site.
    if (value.VERCEL_ENV === "production" && !(value.UPSTASH_REDIS_REST_URL && value.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({ code: "custom", message: "UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib diisi di production" });
    }
  });

export const env = envSchema.parse(process.env);
