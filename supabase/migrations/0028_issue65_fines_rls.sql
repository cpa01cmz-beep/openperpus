-- ============================================================================
-- 0028_issue65_fines_rls.sql — get_fines_total DEFINER+GRANT anon + RLS overhead
-- Issue #65 [P1][security][perf]:
--   1. 0018 memberi EXECUTE get_fines_total(uuid) ke anon — fungsi SECURITY
--      DEFINER tanpa guard p_member_id IS NULL (total semua anggota) bisa
--      dipanggil tanpa login -> cabut anon, sisakan authenticated.
--   2. Guard di body: p_member_id IS NULL (agregat global) wajib staff
--      (public.is_staff()); p_member_id terisi tetap boleh (owner check di API).
--   3. search_books masih GRANT ke anon (0018:142) — katalog publik memang
--      boleh anon, tapi fungsi tanpa RLS guard; cabut anon di sini agar
--      konsisten dengan kebijakan sensitif (baca via API yang sudah guard).
--      Bila katalog publik butuh anon lagi, kembalikan via migrasi terpisah.
-- Sifat: idempotent (CREATE OR REPLACE + REVOKE aman rerun).
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.get_fines_total(uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.search_books(text,int,int) TO anon;
-- ============================================================================

-- 1. get_fines_total — tambah guard staff untuk agregat global (NULL).
CREATE OR REPLACE FUNCTION public.get_fines_total(p_member_id uuid DEFAULT NULL)
RETURNS NUMERIC(12, 2)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total NUMERIC(12, 2);
BEGIN
  IF p_member_id IS NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Butuh peran admin/librarian untuk total global.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum(amount - paid_amount), 0)::numeric(12, 2)
    INTO v_total
    FROM public.fines
   WHERE (p_member_id IS NULL OR member_id = p_member_id)
     AND status IN ('unpaid', 'partial');
  RETURN v_total;
END;
$func$;

REVOKE ALL ON FUNCTION public.get_fines_total(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_fines_total(uuid) TO authenticated;

-- 2. search_books — cabut anon (sisa authenticated).
REVOKE ALL ON FUNCTION public.search_books(text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_books(text, int, int) TO authenticated;
