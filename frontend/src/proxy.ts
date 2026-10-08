import { NextResponse, type NextRequest } from "next/server";

/**
 * Route guard for /admin/*. Only checks that a session cookie exists —
 * real verification happens on the API (/auth/me). Never redirects away
 * from the login page, so stale cookies can't cause redirect loops.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  if (!req.cookies.has("admin_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
