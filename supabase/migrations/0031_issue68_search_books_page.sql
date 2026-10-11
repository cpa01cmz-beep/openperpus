-- ============================================================================
-- 0031_issue68_search_books_page.sql — search katalog 4 RTT -> 1 RTT
-- Issue #68 [P1][perf] sisa: fetchBooksPagedUncached memanggil searchBooksViaRpc
--   2x (halaman + total), masing-masing = RPC search_books + select.in relasi
--   = 4 round-trip; query total mengambil sampai 100 baris b.* (description +
--   search_vector ikut terbawa) hanya untuk COUNT.
-- Fix: SATU RPC search_books_page(p_q, p_limit, p_offset) yang mengembalikan
--   jsonb { total, books[] } — total via window count (COUNT(*) OVER()),
--   baris halaman + relasi kategori/rak ter-join di SQL, kolom sempit
--   (sama dengan BOOKS_LIST_SELECT; tanpa description/pdf_url/search_vector).
--   Urutan relevansi identik search_books (ts_rank DESC, similarity(title)
--   DESC) + tiebreaker id agar paginasi stabil lintas halaman.
--   Sisa RTT 4 -> 1; payload query total hilang.
-- Catatan: search_books LAMA tidak diubah — masih dipakai GET /api/books
--   (?q=) untuk daftar id yang difilter lanjut (kategori/rak/tersedia).
-- Sifat: idempotent (CREATE OR REPLACE).
-- Rollback: DROP FUNCTION IF EXISTS public.search_books_page(text, int, int);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_books_page(
  p_q text,
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $func$
  WITH matched AS (
    SELECT
      b.id, b.title, b.slug, b.author, b.publisher, b.year, b.isbn,
      b.category_id, b.rack_id, b.cover_url, b.pages, b.language,
      b.stock_total, b.stock_available, b.featured, b.rating_avg,
      b.created_at, b.updated_at,
      ts_rank(b.search_vector, plainto_tsquery('simple', p_q)) AS rank,
      similarity(b.title, p_q) AS title_sim
    FROM public.books b
    WHERE b.is_active = TRUE AND (
      -- Jalur 1: full-text (GIN idx_books_search_vector_gin)
      b.search_vector @@ plainto_tsquery('simple', p_q)
      -- Jalur 2: trigram similarity (GIN idx_*_trgm_gin), toleran typo
      OR b.title % p_q OR b.author % p_q
      OR b.title ILIKE '%' || p_q || '%'
      OR b.author ILIKE '%' || p_q || '%'
      OR b.publisher ILIKE '%' || p_q || '%'
      OR b.isbn ILIKE '%' || p_q || '%'
    )
  ),
  -- Window count dihitung SEBELUM LIMIT/OFFSET -> total = seluruh match,
  -- bukan jumlah baris halaman.
  paged AS (
    SELECT m.*, COUNT(*) OVER () AS total
    FROM matched m
    ORDER BY m.rank DESC, m.title_sim DESC, m.id
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT p.total FROM paged p), 0),
    'books', COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(p) - 'rank' - 'title_sim' - 'total')
        || jsonb_build_object(
          'categories', (SELECT to_jsonb(c) FROM public.categories c WHERE c.id = p.category_id),
          'racks', (SELECT to_jsonb(r) FROM public.racks r WHERE r.id = p.rack_id)
        )
        ORDER BY p.rank DESC, p.title_sim DESC, p.id
      )
      FROM paged p
    ), '[]'::jsonb)
  );
$func$;

REVOKE ALL ON FUNCTION public.search_books_page(text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_books_page(text, int, int) TO anon, authenticated;
