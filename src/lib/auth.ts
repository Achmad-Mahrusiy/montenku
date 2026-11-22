import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { env } from "@/lib/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  // Our forms sign in and sign up through Server Actions, which are rate limited (src/server/rate-limit.ts).
  // Closing the same endpoints over HTTP leaves no unlimited way around them. auth.api.* calls still work.
  disabledPaths: ["/sign-in/email", "/sign-up/email"],
  // nextCookies must stay the last plugin so Server Actions can set the session cookie.
  plugins: [nextCookies()],
});
