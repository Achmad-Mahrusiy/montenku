import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

// cache: several components in one request can ask for the session, but the database is read once.
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// The real session check. proxy.ts only looks at whether a cookie exists, which anyone can fake.
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/masuk");
  return session.user;
}
