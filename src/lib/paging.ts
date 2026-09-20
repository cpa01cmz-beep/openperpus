/** Pagination kompatibel kontrak (page/per_page/q) + alias lama (limit/search). */
export function parsePaging(url: string, defPerPage = 10) {
  const sp = new URL(url).searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? '1') || 1);
  const perPage = Math.min(
    100,
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
