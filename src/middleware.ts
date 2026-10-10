import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { updateSession } from '@/lib/supabase/middleware';
import { checkRateLimit, WRITE_API_LIMIT, WRITE_API_WINDOW_MS } from '@/lib/rate-limit';
import { ROLE_HEADER } from '@/lib/role-claim';

/**
 * CSRF guard untuk write /api/*: Origin/Referer harus same-origin LENGKAP
 * (skema + host + port) terhadap effective request origin — hostname saja
 * tidak cukup: port beda (https://x:8443 vs :443) dan http vs https sama
 * host tetap cross-origin dan wajib ditolak.
 * - Browser selalu kirim Origin (atau Referer) pada POST/PUT/PATCH/DELETE.
 * - Null (curl/server-to-server tanpa Origin+Referer) diizinkan agar cronjob
 *   dan non-browser tidak pecah — auth/rate-limit tetap menjadi pertahanan.
 * - Mismatch -> 403 CSRF_MISMATCH tanpa menyentuh Supabase/rate-limit.
 */
const DEFAULT_PORTS: Record<string, string> = { 'https:': '443', 'http:': '80' };

/** Kunci origin ternormalisasi: "https://host:443" — port default skema dipaksa eksplisit. */
function originKey(url: URL): string {
  const port = url.port || DEFAULT_PORTS[url.protocol] || '';
  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}`;
}

/** Effective origin permintaan: x-forwarded-proto/host dulu (CF/proxy), lalu Host + nextUrl. */
function requestOriginKey(request: NextRequest): string | null {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  const scheme =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? `${forwardedProto}:`
      : request.nextUrl.protocol;
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
  if (!host) return null;
  try {
    return originKey(new URL(`${scheme}//${host}`));
  } catch {
    return null;
  }
}
// ponytail: x-forwarded-port belum dibaca — tambahkan bila di belakang proxy yang me-rewrite port.

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (!origin && !referer) return true;
  const target = requestOriginKey(request);
  if (!target) return false;
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      if (originKey(new URL(candidate)) === target) return true;
    } catch {
      return false;
    }
  }
  // Ada header browser tapi tak satu pun cocok -> cross-site.
  return false;
}
/**
 * CSP nonce-based (issue #24): satu header CSP per response, dibangun di
 * middleware agar script-src TANPA 'unsafe-inline' maupun eval di prod.
 * - Next 14.2 membaca nonce dari REQUEST header content-security-policy
 *   (lihat app-render: getScriptNonceFromHeader) lalu menambahkan atribut
 *   nonce pada script inline buatan Next (bootstrap, self.__next_f).
 * - x-nonce ikut di-set sesuai pola docs Next.js untuk pembacaan via headers().
 * - Dev memakai kebijakan lama next.config (looser) agar `npm run dev` tetap
 *   usable; gate pada NODE_ENV.
 * - Edge-safe (Web Crypto + btoa saja) — aman untuk Cloudflare Workers/OpenNext.
 */
const DEV_CSP =
  "default-src 'self' 'unsafe-inline' https: data: blob:; frame-ancestors 'none' object-src 'none'; upgrade-insecure-requests";

function buildProdCsp(scriptSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://*.supabase.co",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * /api/docs adalah HTML dari route handler yang tidak bisa menerima nonce
 * (file src/app/api/** di luar cakupan perubahan ini). Pakai hash statis:
 * - hash ""           -> <script id="api-reference" ...></script> (konten kosong)
 * - hash bootstrap    -> window.__OPENAPI__ = ... (snapshot openapi.yaml;
 *                        ponytail: recompute hash bila openapi.yaml diubah)
 * font-src ditambah host webfonts Scalar (hanya untuk path ini) karena script
 * Scalar kini memuat font-nya sendiri.
 * ponytail: bila route /api/docs diberi nonce sendiri, pola ini bisa dilepas.
 */
const DOCS_CSP = buildProdCsp(
  "'self' https://cdn.jsdelivr.net " +
    "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' " +
    "'sha256-xqy0Wbkb40nzjBQyEJb6IesqywYECKZa7MtRb0r9zQw='"
).replace(
  "font-src 'self' data: https://*.supabase.co;",
  "font-src 'self' data: https://*.supabase.co https://fonts.scalar.com;"
);

function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/** CSP untuk satu request. Prod: nonce-based, script-src hanya 'self' + nonce + Supabase. */
export function buildContentSecurityPolicy(nonce: string): string {
  if (process.env.NODE_ENV === 'development') return DEV_CSP;
  return buildProdCsp(`'self' 'nonce-${nonce}' https://*.supabase.co`);
}

/**
 * Root middleware (src/middleware.ts).
 * - Me-refresh sesi Supabase via updateSession() dari @/lib/supabase/middleware.
 * - Redirect /admin/* tanpa session -> /login?next=<path>.
 * - CSRF: Origin/Referer vs Host untuk write /api/* (403 bila mismatch).
 * - Rate-limit write API (POST/PUT/PATCH/DELETE /api/*): 429 + Retry-After bila abusif.
 * - CSP nonce (issue #24): header CSP per response + forward nonce ke render.
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
  // Selalu buang klaim klien di awal — nilai sah hanya datang dari blok role gate.
  request.headers.delete(ROLE_HEADER);
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isLogin = pathname === '/login' || pathname.startsWith('/login');
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  const isDev = process.env.NODE_ENV === 'development';

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
    if (pathname === '/api/docs') {
      const docsResponse = NextResponse.next();
      docsResponse.headers.set('Content-Security-Policy', isDev ? DEV_CSP : DOCS_CSP);
      return docsResponse;
    }
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);
  // Next 14.2 app-render mem-parse REQUEST content-security-policy untuk nonce;
  // x-nonce mengikuti pola dokumentasi Next.js (dibaca via headers() bila perlu).
  request.headers.set('content-security-policy', csp);
  request.headers.set('x-nonce', nonce);

  if (!isAdmin && !isLogin) {
    const response = NextResponse.next({ request });
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  let sessionResponse: NextResponse;
  let user = null;
  try {
    const session = await updateSession(request);
    sessionResponse = session.response;
    user = session.user;
  } catch {
    // { request } agar header CSP/nonce ikut diteruskan ke render.
    sessionResponse = NextResponse.next({ request });
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
  //    wajib staff (admin|librarian). Klaim role ditaruh di header request
  //    (overwrite) untuk admin layout — 1 query role per hit, bukan 2.
  //    Fail-closed: role bukan staff / query gagal → redirect '/'.
  if (isAdmin && user) {
    const role = await getProfileRole(request, user.id);
    if (role !== 'admin' && role !== 'librarian') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    request.headers.set(ROLE_HEADER, role);
    // sessionResponse dibuat di updateSession SEBELUM klaim di-set —
    // handleMiddlewareField me-snapshot header saat konstruksi, jadi bangun
    // ulang response agar x-role ikut diteruskan; cookie refresh disalin.
    const claimed = NextResponse.next({ request });
    for (const c of sessionResponse.cookies.getAll()) claimed.cookies.set(c);
    sessionResponse = claimed;
  }

  sessionResponse.headers.set('Content-Security-Policy', csp);
  return sessionResponse;
}

export const config = {
  // Semua rute HTML butuh CSP (issue #24); kecualikan aset statis yang tidak
  // pernah jadi dokumen HTML.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
