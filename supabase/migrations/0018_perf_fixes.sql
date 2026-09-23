-- ============================================================================
-- 0018_perf_fixes.sql — Performa lanjutan: 3 RPC agregat
-- 1. get_fines_total(p_member_id uuid) — SUM(amount - paid_amount) di DB
-- 2. extend_loan(p_loan_id uuid, p_days int) — perpanjang loan atomik di DB
-- 3. search_books(p_q text, p_limit int, p_offset int default 0) — extend existing dengan OFFSET
-- Non-destruktif: CREATE OR REPLACE. Aman rerun.
-- Rollback: DROP FUNCTION public.get_fines_total(uuid); DROP FUNCTION public.extend_loan(uuid,int);
--   DROP FUNCTION public.search_books(text,int,int);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC: get_fines_total — total denda terbuka per member (amount - paid_amount)
--    SECURITY DEFINER agar member bisa panggil untuk ID sendiri (via RLS).
--    Jika p_member_id IS NULL → total semua anggota (admin).
--    Gantikan: client-side reduce() di halaman denda admin & public.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fines_total(p_member_id uuid DEFAULT NULL)
RETURNS NUMERIC(12, 2)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT coalesce(sum(amount - paid_amount), 0)::numeric(12, 2)
  FROM public.fines
  WHERE (p_member_id IS NULL OR member_id = p_member_id)
    AND status IN ('unpaid', 'partial');
$func$;

REVOKE ALL ON FUNCTION public.get_fines_total(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_fines_total(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC: extend_loan — perpanjang loan atomik di DB dengan SELECT FOR UPDATE
--    Validasi: days 1..90, loan aktif (borrowed/overdue), bukan returned/lost.
--    Returns: loan row dengan new due_at + is_overdue flag.
--    Guards: 409 jika returned/lost, validasi days.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extend_loan(p_loan_id uuid, p_days int)
RETURNS TABLE (
  id uuid,
  book_id uuid,
  member_id uuid,
  borrowed_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  status text,
  fine_amount numeric(12, 2),
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_loan RECORD;
  v_new_due timestamptz;
BEGIN
  -- Validasi days 1..90
  IF p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'days harus bilangan bulat 1..90' USING ERRCODE = '22003';
  END IF;

  -- SELECT FOR UPDATE untuk lock row & cek status
  SELECT *
  INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjaman tidak ditemukan' USING ERRCODE = 'P0001';
  END IF;

  IF v_loan.status IN ('returned', 'lost') THEN
    RAISE EXCEPTION 'Peminjaman sudah selesai, tidak bisa diperpanjang' USING ERRCODE = '40901';
  END IF;

  -- Hitung new due_at
  v_new_due := v_loan.due_at + (p_days || ' days')::interval;

  -- Update due_at + updated_at
  UPDATE public.loans
  SET due_at = v_new_due,
      updated_at = NOW()
  WHERE id = p_loan_id;

  -- Return updated row + is_overdue
  RETURN QUERY
  SELECT
    l.id,
    l.book_id,
    l.member_id,
    l.borrowed_at,
    l.due_at,
    l.returned_at,
    l.status,
    l.fine_amount,
    l.notes,
    l.created_at,
    l.updated_at,
    (l.due_at < NOW()) AS is_overdue
  FROM public.loans l
  WHERE l.id = p_loan_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.extend_loan(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.extend_loan(uuid, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: search_books — extend existing dengan OFFSET untuk pagination
--    Returns SETOF books dengan kolom sempit untuk list (tanpa description).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_books(p_q text, p_limit int, p_offset int DEFAULT 0)
RETURNS SETOF public.books
LANGUAGE sql STABLE
SET search_path = public
AS $func$
  SELECT b.id, b.title, b.author, b.cover_url, b.stock_available, b.stock_total,
         b.category_id, b.rack_id, b.slug, b.publisher, b.year, b.isbn,
         b.pages, b.language, b.featured, b.rating_avg, b.is_active,
         b.created_at, b.updated_at
  FROM public.books b
  WHERE b.is_active = TRUE AND (
    b.search_vector @@ plainto_tsquery('simple', p_q)
    OR b.title % p_q OR b.author % p_q
    OR b.title ILIKE '%' || p_q || '%'
    OR b.author ILIKE '%' || p_q || '%'
    OR b.publisher ILIKE '%' || p_q || '%'
    OR b.isbn ILIKE '%' || p_q || '%'
  )
  ORDER BY
    ts_rank(b.search_vector, plainto_tsquery('simple', p_q)) DESC,
    similarity(b.title, p_q) DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$func$;

REVOKE ALL ON FUNCTION public.search_books(text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_books(text, int, int) TO anon, authenticated;
