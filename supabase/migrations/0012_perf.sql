-- ============================================================================
-- 0012_perf.sql — Performa & Kecepatan (target skor 90+)
-- 1. pg_trgm + GIN indexes agar ilike %needle% tidak full-scan
-- 2. tsvector full-text (search_vector) sebagai jalur utama pencarian
-- 3. RPC agregat: get_library_stats, get_loans_per_day, get_overdue_count
--    -> gantikan agregasi client-side (sum di JS, group-by di JS, filter array)
-- Non-destruktif: CREATE IF NOT EXISTS / CREATE OR REPLACE. Aman rerun.
-- Rollback: DROP FUNCTION ...; DROP INDEX ...; ALTER TABLE books DROP COLUMN search_vector;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extension pg_trgm
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 2. GIN trigram indexes untuk kolom pencarian katalog
--    Membuat WHERE col ILIKE '%needle%' memakai Bitmap Index Scan
--    (tanpa ini: Seq Scan full-table).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_books_title_trgm_gin
  ON public.books USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_author_trgm_gin
  ON public.books USING gin (author gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_publisher_trgm_gin
  ON public.books USING gin (publisher gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_isbn_trgm_gin
  ON public.books USING gin (isbn gin_trgm_ops);

-- Index lama btree di 0001 (idx_books_title_trgm, idx_books_author) tetap
-- dipertahankan untuk prefix/sort; GIN di atas yang melayani %needle%.

-- ----------------------------------------------------------------------------
-- 3. Full-text search vector (tsvector) + GIN — jalur utama search_books()
-- ----------------------------------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.books_search_vector_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.author, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.publisher, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.isbn, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_books_search_vector ON public.books;
CREATE TRIGGER trg_books_search_vector
  BEFORE INSERT OR UPDATE OF title, author, publisher, isbn ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.books_search_vector_trigger();

-- Backfill baris lama (idempotent, hanya yang NULL).
UPDATE public.books
SET search_vector =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(author, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(publisher, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(isbn, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_search_vector_gin
  ON public.books USING gin (search_vector);

-- ----------------------------------------------------------------------------
-- 4. RPC: search_books — gantikan .or(ilike %..%) dari klien dengan satu
--    query server-side: full-text dulu, fallback trigram similarity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_books(p_q TEXT, p_limit INT DEFAULT 24)
RETURNS SETOF public.books
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  SELECT b.*
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
  ORDER BY
    ts_rank(b.search_vector, plainto_tsquery('simple', p_q)) DESC,
    similarity(b.title, p_q) DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$func$;

REVOKE ALL ON FUNCTION public.search_books(TEXT, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_books(TEXT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC: get_library_stats — SATU agregat SQL untuk fetchStats().
--    Gantikan: 3x head-count + SELECT 5000 stock_total lalu reduce() di JS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_library_stats()
RETURNS TABLE (total_books BIGINT, total_categories BIGINT, total_articles BIGINT, total_copies BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  SELECT
    (SELECT count(*) FROM public.books WHERE is_active = TRUE),
    (SELECT count(*) FROM public.categories WHERE is_active = TRUE),
    (SELECT count(*) FROM public.articles WHERE status = 'published'),
    (SELECT coalesce(sum(stock_total), 0) FROM public.books WHERE is_active = TRUE);
$func$;

REVOKE ALL ON FUNCTION public.get_library_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_library_stats() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: get_loans_per_day — group-by date_trunc di Postgres untuk chart
--    dashboard 7 hari. Gantikan: fetch 500 borrowed_at + forEach di JS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_loans_per_day(p_days INT DEFAULT 7)
RETURNS TABLE (day DATE, total BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  SELECT d.day::date AS day, count(l.id) AS total
  FROM (
    SELECT (CURRENT_DATE - (generate_series(0, LEAST(GREATEST(p_days, 1), 90) - 1) || ' days')::interval)::date AS day
  ) d
  LEFT JOIN public.loans l
    ON l.borrowed_at::date = d.day::date
  GROUP BY d.day
  ORDER BY d.day ASC;
$func$;

REVOKE ALL ON FUNCTION public.get_loans_per_day(INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_loans_per_day(INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: get_overdue_count — hitung terlambat di DB, bukan array filter.
--    Gantikan: SELECT 500 due_at lalu .filter(new Date(due_at) < now) di JS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_overdue_count()
RETURNS BIGINT
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  SELECT count(*) FROM public.loans
  WHERE status IN ('borrowed', 'overdue') AND due_at < NOW();
$func$;

REVOKE ALL ON FUNCTION public.get_overdue_count() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_overdue_count() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Index pendukung agregat dashboard (filter borrowed_at / due_at+status)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loans_borrowed_date
  ON public.loans ((borrowed_at::date));
CREATE INDEX IF NOT EXISTS idx_loans_status_due
  ON public.loans (status, due_at);
