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
  // Hapus akun (D-034): deletes the user row; every table of ours cascades from it. Asked with the password.
  user: { deleteUser: { enabled: true } },
  // Our forms sign in, sign up and delete the account through Server Actions, which are rate limited
  // (src/server/rate-limit.ts) and, for deleting, also ask for "HAPUS". Closing the same endpoints over HTTP leaves
  // no way around them; /verify-password would be an unlimited password check. auth.api.* calls still work.
  disabledPaths: ["/sign-in/email", "/sign-up/email", "/delete-user", "/verify-password"],
  // nextCookies must stay the last plugin so Server Actions can set the session cookie.
  plugins: [nextCookies()],
});
