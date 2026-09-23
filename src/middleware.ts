import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { updateSession } from '@/lib/supabase/middleware';
import { checkRateLimit, WRITE_API_LIMIT, WRITE_API_WINDOW_MS } from '@/lib/rate-limit';

/**
 * CSRF guard untuk write /api/*: Origin/Referer harus sama-origin dengan Host.
 * - Browser selalu kirim Origin (atau Referer) pada POST/PUT/PATCH/DELETE.
 * - Null (curl/server-to-server tanpa Origin+Referer) diizinkan agar cronjob
 *   dan non-browser tidak pecah — auth/rate-limit tetap menjadi pertahanan.
 * - Mismatch -> 403 CSRF_MISMATCH tanpa menyentuh Supabase/rate-limit.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (!origin && !referer) return true;
  const host =
    (
      request.headers.get('x-forwarded-host') ??
      request.headers.get('host') ??
      request.nextUrl.host ??
      ''
    )
      .split(',')[0]
      ?.trim()
      .toLowerCase() ?? '';
  const hostName = host.split(':')[0] ?? '';
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.hostname.toLowerCase() === hostName) return true;
    } catch {
      return false;
    }
  }
  // Ada header browser tapi tak satu pun cocok -> cross-site.
  if (origin || referer) return false;
  return true;
}
/**
 * Root middleware (src/middleware.ts).
 * - Me-refresh sesi Supabase via updateSession() dari @/lib/supabase/middleware.
 * - Redirect /admin/* tanpa session -> /login?next=<path>.
 * - CSRF: Origin/Referer vs Host untuk write /api/* (403 bila mismatch).
 * - Rate-limit write API (POST/PUT/PATCH/DELETE /api/*): 429 + Retry-After bila abusif.
 * - Edge-safe: hanya next/server + @supabase/ssr + Map/Date (tanpa API Node-only),
 *   aman untuk Cloudflare Workers via OpenNext.
 * - Single getUser per hit: user dipakai ulang dari updateSession,
 *   tanpa createServerClient->getUser kedua.
 */
/**
 * Role gate /admin (defense-in-depth lapisan edge, I5): baca profiles.role
 * dengan client read-only — cookie sudah di-refresh updateSession, jadi
 * setAll cukup no-op. Fail-closed: query gagal / role hilang → non-staff.
 */
async function getProfileRole(request: NextRequest, userId: string): Promise<string | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {
            /* refresh token sudah ditangani updateSession; baca-saja di sini */
          },
        },
      }
    );
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    return (data as { role?: string } | null)?.role ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isLogin = pathname === '/login' || pathname.startsWith('/login');
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  // Rate-limit + CSRF hanya untuk write API — read (GET/HEAD/OPTIONS) bebas.
  if (isApi) {
    const method = request.method.toUpperCase();
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      if (!isSameOrigin(request)) {
        return NextResponse.json(
          { error: { code: 'CSRF_MISMATCH', message: 'Origin tidak valid.' } },
          { status: 403 }
        );
      }
      const ip =
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown';
      const result = checkRateLimit(
        `write:${ip}:${pathname}`,
        WRITE_API_LIMIT,
        WRITE_API_WINDOW_MS
      );
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil(result.resetAfterMs / 1000));
        return NextResponse.json(
          {
            error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi nanti.' },
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(WRITE_API_LIMIT),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }
    }
    return NextResponse.next();
  }

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
    url.pathname = '/login';
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // 3. Role gate /admin (I5 defense-in-depth): sesi SAJA tidak cukup —
  //    wajib staff (admin|librarian), sejajar admin/layout.tsx.
  //    Fail-closed: role bukan staff / query gagal → redirect '/'.
  if (isAdmin && user) {
    const role = await getProfileRole(request, user.id);
    if (role !== 'admin' && role !== 'librarian') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: ['/admin/:path*', '/login', '/api/:path*'],
};
