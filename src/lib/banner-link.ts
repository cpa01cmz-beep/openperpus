/** CMS banner.link resolver — allowlist internal routes, fallback /katalog. Pure + server/client-safe. */

export const BANNER_FALLBACK = '/katalog';

const STATIC_ROUTES: ReadonlySet<string> = new Set([
  '/',
  '/katalog',
  '/berita',
  '/tentang',
  '/layanan',
  '/faq',
  '/kontak',
  '/reservasi-saya',
  '/denda',
  '/login',
]);

const PREFIX_ROUTES: readonly string[] = ['/katalog/', '/berita/', '/halaman/'];

/**
 * Sanitize CMS banner.link against the internal route map.
 * External URLs (http/https/protocol-relative), non-http schemes
 * (javascript:, data:, mailto:…), and unknown paths fall back to /katalog.
 */
export function resolveBannerHref(link: string | null | undefined): string {
  if (!link) return BANNER_FALLBACK;
  const trimmed = link.trim();
  if (!trimmed) return BANNER_FALLBACK;
  // External: http(s)://… or protocol-relative //…
  if (/^(https?:)?\/\//i.test(trimmed)) return BANNER_FALLBACK;
  // Any other scheme (javascript:, data:, mailto:, tel:, …) — never pass through.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return BANNER_FALLBACK;
  if (!trimmed.startsWith('/')) return BANNER_FALLBACK;
  const rawPath = trimmed.split('?')[0]?.split('#')[0] ?? '/';
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  if (STATIC_ROUTES.has(path)) return trimmed;
  if (PREFIX_ROUTES.some((p) => path.startsWith(p) && path.length > p.length)) return trimmed;
  return BANNER_FALLBACK;
}
