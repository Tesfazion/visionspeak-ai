import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth gate for the private routes. (Next 16 renamed the `middleware` file
 * convention to `proxy`; the behavior is the same.)
 *
 * This lives in the proxy rather than only in the page so the redirect is a
 * real 307 issued before rendering starts. A `redirect()` called inside a page
 * body runs *after* Next has begun streaming the shell, which produces
 * `200 OK` plus a client-side meta refresh — fine in a browser, wrong for
 * curl, uptime checks and CI.
 *
 * Only the cookie's presence is checked here (cheap, no crypto, no disk). The
 * signature is verified and the user loaded in the route itself, so a forged
 * cookie still cannot read anything — it just reaches the page-level check.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/studio"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (request.cookies.get("vs_session")?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/dashboard/:path*", "/studio/:path*"],
};
