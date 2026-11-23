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
    // Reminder emails (Fase 4). Without a verified domain Resend only delivers to the Resend account's own address.
    RESEND_API_KEY: optional(z.string()),
    EMAIL_FROM: z.preprocess((value) => (value === "" ? undefined : value), z.string().default("Montenku <onboarding@resend.dev>")),
    // Vercel sends it as "Authorization: Bearer <CRON_SECRET>" to the cron and sweeper route.
    CRON_SECRET: optional(z.string().min(16, "CRON_SECRET minimal 16 karakter")),
    VERCEL_ENV: optional(z.string()),
  })
  .superRefine((value, ctx) => {
    // Rate limiting, email and the reminder cron may be off on your laptop, never on the live site.
    if (value.VERCEL_ENV !== "production") return;
    for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "RESEND_API_KEY", "CRON_SECRET"] as const) {
      if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} wajib diisi di production` });
    }
  });

export const env = envSchema.parse(process.env);
