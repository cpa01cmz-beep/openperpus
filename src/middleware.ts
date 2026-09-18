import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware (src/middleware.ts).
 * - Me-refresh sesi Supabase via updateSession() dari @/lib/supabase/middleware.
 * - Redirect /admin/* tanpa session -> /login?next=<path>.
 * - Edge-safe: hanya next/server + @supabase/ssr (tanpa API Node-only),
 *   aman untuk Cloudflare Workers via OpenNext.
 * - Single getUser per hit: user dipakai ulang dari updateSession,
 *   tanpa createServerClient->getUser kedua.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/login" || pathname.startsWith("/login");

  if (!isAdmin && !isLogin) return NextResponse.next();

  let sessionResponse: NextResponse;
  let user = null;
  try {
    const session = await updateSession(request);
    sessionResponse = session.response;
    user = session.user;
  } catch {
    sessionResponse = NextResponse.next();
  }

  // 2. Cek sesi untuk kebutuhan redirect — pakai ulang user di atas,
  //    tanpa client getUser kedua (cookie refresh dipegang sessionResponse).
  if (!user && isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return sessionResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
