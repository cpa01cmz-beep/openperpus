-- ============================================================================
-- 0019_role_guard.sql — Tutup eskalasi librarian→admin pada profiles.role (I5)
-- Dependensi: 0002_rls.sql (public.is_admin()), 0003_hardening.sql (strip).
-- Lubang yang ditutup:
--   policy "staff manage profiles" (0002) + strip_profiles_role() yang
--   melewatkan aktor is_staff() (0003 baris 24) → librarian bisa
--   UPDATE profiles SET role='admin' (eskalasi penuh ke hak admin).
-- Perbaikan: trigger BEFORE INSERT OR UPDATE OF role yang ME-RAISE
--   (error 42501, bukan strip senyap) bila perubahan role bukan oleh admin.
--   * UPDATE: OLD.role IS DISTINCT FROM NEW.role AND NOT is_admin() → raise.
--   * INSERT: role non-'member' oleh non-admin → raise (librarian tak bisa
--     membuat akun staff/admin baru; jalur register selalu role='member').
-- Urutan trigger per event = alfabetis: trg_0019_* < trg_strip_*, jadi
--   guard berjalan sebelum strip 0003. Keamanan TIDAK bergantung urutan:
--   strip bersifat netral-insecure (revert senyap untuk non-staff), guard
--   adalah penutup lubang bagi aktor staff.
-- Konteks tanpa sesi (psql/SQL editor/service_role: auth.uid() IS NULL)
--   dilewatkan — jalur seed/admin manual tepercaya; RLS tetap berlaku untuk
--   semua jalur ber-sesi (authenticated).
-- Catatan CHECK 0001: role IN ('admin','librarian','member') — register
--   (src/app/api/register/route.ts) selalu INSERT role='member' → lolos.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_0019_profiles_role_guard ON public.profiles;
--   DROP FUNCTION IF EXISTS public.guard_profiles_role_change();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_profiles_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Jalur tanpa sesi (psql / service_role / SQL editor): bukan aktor aplikasi.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- INSERT: hanya admin yang boleh membuat profile non-member.
  IF TG_OP = 'INSERT'
     AND NEW.role IS DISTINCT FROM 'member'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'ROLE_ESCALATION_DENIED: hanya admin yang boleh membuat profile non-member'
      USING ERRCODE = '42501';
  END IF;
  -- UPDATE: hanya admin yang boleh mengubah profiles.role
  -- (menutup celah "staff manage profiles" + strip yang melewatkan is_staff).
  IF TG_OP = 'UPDATE'
     AND OLD.role IS DISTINCT FROM NEW.role
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'ROLE_ESCALATION_DENIED: hanya admin yang boleh mengubah profiles.role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.guard_profiles_role_change() IS
  'I5: tolak perubahan profiles.role oleh aktor ber-sesi non-admin (tutup celah is_staff di 0003 strip trigger).';

-- Nama 'trg_0019_...' sengaja alfabetis sebelum 'trg_strip_...' (0003).
DROP TRIGGER IF EXISTS trg_0019_profiles_role_guard ON public.profiles;
CREATE TRIGGER trg_0019_profiles_role_guard
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_role_change();
