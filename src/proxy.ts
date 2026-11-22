import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/masuk", "/daftar"];

// Fast redirect for visitors with no session cookie. It does not prove the cookie is valid;
// every protected page still calls requireUser(), see docs/fase-0-arsitektur.md.
export function proxy(request: NextRequest) {
  if (publicPaths.includes(request.nextUrl.pathname)) return NextResponse.next();
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/masuk", request.url));
  return NextResponse.next();
}

export const config = {
  // Skip API routes (they answer for themselves), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
