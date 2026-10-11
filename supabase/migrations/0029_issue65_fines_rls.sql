-- ============================================================================
-- 0029_issue65_fines_rls.sql — get_fines_total DEFINER+GRANT anon + RLS overhead
-- Issue #65 [P1][security][perf]:
--   1. 0018 memberi EXECUTE get_fines_total(uuid) ke anon — fungsi SECURITY
--      DEFINER tanpa guard p_member_id IS NULL (total semua anggota) bisa
--      dipanggil tanpa login -> cabut anon, sisakan authenticated.
--   2. Guard di body: p_member_id IS NULL (agregat global) wajib staff
--      (public.is_staff()); p_member_id terisi wajib staff ATAU owner
--      (members.user_id = auth.uid()) — DEFINER bypass RLS sehingga owner
--      check API saja tidak cukup untuk RPC langsung.
--   3. search_books TETAP GRANT ke anon (0018:142 + 0012:96) — katalog publik
--      memang boleh anon (buku is_active); fungsi hanya mengembalikan buku
--      publik. Mencabut anon di sini merusak GET /api/books?q= publik
--      (anon key) tanpa manfaat keamanan. Tidak diubah di sini.
-- Sifat: idempotent (CREATE OR REPLACE + REVOKE aman rerun).
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.get_fines_total(uuid) TO anon;
-- ============================================================================

-- 1. get_fines_total — guard staff untuk agregat global (NULL) + owner
--    untuk p_member_id terisi. DEFINER bypass RLS, jadi tanpa guard kedua
--    member login bisa rpc p_member_id milik orang lain (jalur API aman via
--    requireStaff/owner, tapi RPC langsung tetap terbuka).
--    Owner = members.user_id = auth.uid() untuk p_member_id tersebut.
CREATE OR REPLACE FUNCTION public.get_fines_total(p_member_id uuid DEFAULT NULL)
RETURNS NUMERIC(12, 2)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total NUMERIC(12, 2);
BEGIN
  IF p_member_id IS NULL THEN
    IF NOT public.is_staff() THEN
      RAISE EXCEPTION 'Butuh peran admin/librarian untuk total global.' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_staff()
    AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id AND m.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Hanya staf atau pemilik data yang boleh melihat total denda.' USING ERRCODE = '42501';
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
