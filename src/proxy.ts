import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/masuk", "/daftar", "/beranda"];

// Fast redirect for visitors with no session cookie. It does not prove the cookie is valid;
// every protected page still calls requireUser(), see docs/fase-0-arsitektur.md.
// "/" without a cookie shows the public front page in place (rewrite, the address stays "/"), D-043.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.includes(pathname)) return NextResponse.next();
  const signedIn = Boolean(getSessionCookie(request));
  if (!signedIn && pathname === "/") return NextResponse.rewrite(new URL("/beranda", request.url));
  if (!signedIn) return NextResponse.redirect(new URL("/masuk", request.url));
  return NextResponse.next();
}

export const config = {
  // Skip API routes (they answer for themselves), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
