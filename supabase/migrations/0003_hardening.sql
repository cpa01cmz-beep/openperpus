-- ============================================================================
-- 0003_hardening.sql — RLS hardening T-S3 (RED -> GREEN)
-- Menutup 3 lubang eskalasi dari 0002_rls.sql tanpa mengubah 0001/0002:
--   1. profiles: user bisa self-INSERT/UPDATE kolom role -> admin (eskalasi).
--   2. activity_logs: INSERT WITH CHECK (true) -> siapa pun bisa spoof log.
--   3. members: self-update bisa ubah status/user_id (bypass alur staff).
-- Prinsip: trigger strip kolom privileged untuk non-staff + policy aktor.
-- Helper public.is_staff()/is_admin() dari 0002 dipakai ulang (SECURITY DEFINER).
-- Re-runnable: semua objek pakai OR REPLACE / IF EXISTS / DROP IF EXISTS.
-- Rollback: DROP TRIGGER trg_strip_profiles_role ON public.profiles;
--   DROP TRIGGER trg_strip_members_privileged ON public.members;
--   DROP FUNCTION public.strip_profiles_role(), public.strip_members_privileged_columns();
--   DROP POLICY "authenticated insert own logs" ON public.activity_logs; ...
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles — role-strip trigger: non-staff tidak bisa angkat role sendiri
--    (role tampilan "anggota" dipetakan ke nilai CHECK 'member' di 0001_core.sql)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.strip_profiles_role()
RETURNS TRIGGER AS $$
BEGIN
  -- staff (admin|librarian) lolos: biarkan apa adanya.
  IF public.is_staff() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- anggota baru: paksa role dasar walau klien mengirim 'admin'.
    NEW.role := 'member';
  ELSE
    -- update sendiri: kembalikan role lama walau klien mengirim 'admin'.
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.strip_profiles_role() IS 'T-S3: strip eskalasi role profiles untuk non-staff (insert -> member/anggota, update -> OLD.role).';

DROP TRIGGER IF EXISTS trg_strip_profiles_role ON public.profiles;
CREATE TRIGGER trg_strip_profiles_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.strip_profiles_role();

-- ----------------------------------------------------------------------------
-- 2. activity_logs — actor check: INSERT hanya atas nama diri sendiri / staff
--    Menutup policy permisif "authenticated insert logs" WITH CHECK (true).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated insert logs" ON public.activity_logs;
DROP POLICY IF EXISTS "authenticated insert own logs" ON public.activity_logs;
CREATE POLICY "authenticated insert own logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_staff());
-- NOTE actor: kolom aktor di tabel ini bernama user_id (lihat 0001_core.sql);
-- policy di atas mengikat auth.uid() ke user_id sehingga spoof log tertutup.

-- ----------------------------------------------------------------------------
-- 3. members — staff-only status guard: self-update hanya kolom kontak
--    Policy: self boleh UPDATE baris sendiri, staff full; trigger: non-staff
--    tidak bisa ubah status/user_id/member_code (dikembalikan ke OLD).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.strip_members_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_staff() THEN
    RETURN NEW;
  END IF;
  -- kolom kontak (phone/address) boleh berubah; kolom privileged dikunci.
  NEW.status := OLD.status;
  NEW.user_id := OLD.user_id;
  NEW.member_code := OLD.member_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.strip_members_privileged_columns() IS 'T-S3: kunci status/user_id/member_code members untuk non-staff; self-update hanya phone/address.';

DROP TRIGGER IF EXISTS trg_strip_members_privileged ON public.members;
CREATE TRIGGER trg_strip_members_privileged
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.strip_members_privileged_columns();

DROP POLICY IF EXISTS "members update own or staff" ON public.members;
DROP POLICY IF EXISTS "members self update contact" ON public.members;
DROP POLICY IF EXISTS "staff manage members status" ON public.members;
CREATE POLICY "members self update contact"
  ON public.members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff manage members status"
  ON public.members FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
