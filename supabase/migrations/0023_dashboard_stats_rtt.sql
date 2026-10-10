-- ============================================================================
-- 0023_dashboard_stats_rtt.sql — Dashboard 1-RTT: get_dashboard_stats v2 + index (#58)
-- 1. get_dashboard_stats v2: + fine_per_day (hapus serial getFineRate),
--    + fines_open (tagihan terbuka ala get_fines_total),
--    chart bucket sargable: borrowed_at >= d.day AND < d.day+1 (bukan ::date).
-- 2. Index pendukung: idx_loans_borrowed_at (recent ORDER BY + range chart),
--    idx_loans_active_due partial (overdue queue: status IN + due_at ASC LIMIT 8).
-- Non-destruktif utk data. DROP+CREATE fungsi hanya utk mengubah return type.
-- Rollback: DROP FUNCTION IF EXISTS public.get_dashboard_stats(INT); jalankan
--   ulang 0017_dashboard_stats.sql; DROP INDEX IF EXISTS public.idx_loans_borrowed_at,
--   public.idx_loans_active_due;
-- Catatan: index dibuat non-CONCURRENTLY agar satu transaction migration
--   (pola repo). Untuk tabel besar di produksi, jalankan manual:
--   CREATE INDEX CONCURRENTLY ... (lihat catatan verifikasi PR #58).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC get_dashboard_stats v2 — tidak bisa ALTER return type, harus DROP+CREATE
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_dashboard_stats(INT);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_days INT DEFAULT 7)
RETURNS TABLE (
  total_books BIGINT,
  total_members BIGINT,
  active_loans BIGINT,
  overdue_count BIGINT,
  loans_per_day JSONB,
  fine_per_day NUMERIC(12, 2),
  fines_open NUMERIC(12, 2)
)
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  WITH stats AS (
    SELECT
      (SELECT count(*) FROM public.books WHERE is_active = TRUE) AS total_books,
      (SELECT count(*) FROM public.members) AS total_members,
      (SELECT count(*) FROM public.loans WHERE status IN ('borrowed', 'overdue')) AS active_loans,
      (SELECT count(*) FROM public.loans
       WHERE status IN ('borrowed', 'overdue') AND due_at < NOW()) AS overdue_count,
      (SELECT coalesce(ls.fine_per_day, 1000)
         FROM public.library_settings ls WHERE ls.id = 1) AS fine_per_day,
      (SELECT coalesce(sum(f.amount - f.paid_amount), 0)
         FROM public.fines f WHERE f.status IN ('unpaid', 'partial')) AS fines_open
  ),
  per_day AS (
    SELECT jsonb_agg(
      jsonb_build_object('day', d.day, 'total', COALESCE(l.total, 0))
      ORDER BY d.day
    ) AS loans_per_day
    FROM (
      SELECT (CURRENT_DATE - (generate_series(0, LEAST(GREATEST(p_days, 1), 90) - 1) || ' days')::interval)::date AS day
    ) d
    -- Sargable (#58): range [day 00:00, day+1 00:00) UTC — hit index btree
    -- borrowed_at, bukan filter borrowed_at::date (STABLE, tak sargable).
    LEFT JOIN LATERAL (
      SELECT count(*) AS total
      FROM public.loans l
      WHERE l.borrowed_at >= (d.day::timestamp) AT TIME ZONE 'UTC'
        AND l.borrowed_at < ((d.day + 1)::timestamp) AT TIME ZONE 'UTC'
    ) l ON true
  )
  SELECT
    s.total_books,
    s.total_members,
    s.active_loans,
    s.overdue_count,
    COALESCE(pd.loans_per_day, '[]'::jsonb),
    coalesce(s.fine_per_day, 1000),
    coalesce(s.fines_open, 0)::numeric(12, 2)
  FROM stats s, per_day pd;
$func$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Index pendukung dashboard (#58)
-- ----------------------------------------------------------------------------
-- Recent activity: ORDER BY borrowed_at DESC LIMIT 8 + range scan chart.
CREATE INDEX IF NOT EXISTS idx_loans_borrowed_at
  ON public.loans (borrowed_at DESC);

-- Overdue queue: status IN ('borrowed','overdue') AND due_at < now()
-- ORDER BY due_at ASC LIMIT 8 — partial, urut due_at langsung tanpa sort.
CREATE INDEX IF NOT EXISTS idx_loans_active_due
  ON public.loans (due_at)
  WHERE status IN ('borrowed', 'overdue');
