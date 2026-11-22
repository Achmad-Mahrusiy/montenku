import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth's own HTTP endpoints (/api/auth/*). Our forms use Server Actions instead, but later
// features (email verification and password reset links) need these URLs to exist.
export const { GET, POST } = toNextJsHandler(auth);
