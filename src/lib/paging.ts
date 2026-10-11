/**
 * SATU kontrak pagination (page/per_page/q) + alias lama (limit/search).
 *
 * Issue #68 (perf): default & batas disatukan supaya biaya query per hitu
 * bisa diperkirakan — default 24 dan maks 50 (sebelumnya per-route 10/20 dan
 * plafon 100, dan beberapa halaman mengizinkan ?per_page=100 yang memicu
 * row fetch besar + seq-scan count exact). Nilai >50 di-clamp, bukan ditolak,
 * agar klien lama tidak pecah.
 */
export const DEFAULT_PER_PAGE = 24;
export const MAX_PER_PAGE = 50;

export function parsePaging(url: string, defPerPage: number = DEFAULT_PER_PAGE) {
  const sp = new URL(url).searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? '1') || 1);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Number(sp.get('per_page') ?? sp.get('limit') ?? String(defPerPage)) || defPerPage)
  );
  const q = (sp.get('q') ?? sp.get('search') ?? '').trim();
  return {
    sp,
    page,
    perPage,
    q,
    from: (page - 1) * perPage,
    to: (page - 1) * perPage + perPage - 1,
  };
}
