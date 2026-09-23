-- ============================================================================
-- 0017_dashboard_stats.sql — RPC agregat dashboard admin (1 round-trip)
-- Menggabungkan: get_library_stats + get_loans_per_day + get_overdue_count
-- Gantikan: 6 parallel queries di admin/page.tsx (lines 12-43)
-- Non-destruktif: CREATE OR REPLACE. Aman rerun.
-- Rollback: DROP FUNCTION IF EXISTS public.get_dashboard_stats();
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC: get_dashboard_stats — SATU panggilan untuk seluruh dashboard
-- Returns: counts (books, members, active_loans, overdue), loans_per_day[7], overdue_count
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_days INT DEFAULT 7)
RETURNS TABLE (
  total_books BIGINT,
  total_members BIGINT,
  active_loans BIGINT,
  overdue_count BIGINT,
  loans_per_day JSONB
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
       WHERE status IN ('borrowed', 'overdue') AND due_at < NOW()) AS overdue_count
  ),
  per_day AS (
    SELECT jsonb_agg(
      jsonb_build_object('day', d.day, 'total', COALESCE(l.total, 0))
      ORDER BY d.day
    ) AS loans_per_day
    FROM (
      SELECT (CURRENT_DATE - (generate_series(0, LEAST(GREATEST(p_days, 1), 90) - 1) || ' days')::interval)::date AS day
    ) d
    LEFT JOIN LATERAL (
      SELECT count(*) AS total
      FROM public.loans l
      WHERE l.borrowed_at::date = d.day
    ) l ON true
  )
  SELECT
    s.total_books,
    s.total_members,
    s.active_loans,
    s.overdue_count,
    COALESCE(pd.loans_per_day, '[]'::jsonb)
  FROM stats s, per_day pd;
$func$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(INT) TO authenticated;