-- ============================================================================
-- 0002_rls.sql — Row Level Security CMS Perpustakaan
-- Dependensi: 0001_core.sql (tabel + kolom), auth.users, auth.uid()
-- Prinsip:
--   * Katalog publik (settings/categories/books/banners/articles/pages +
--     racks/testimonials/faqs/menus) bisa dibaca anon, tapi hanya yang
--     published / active.
--   * Tulis (INSERT/UPDATE/DELETE) katalog hanya staff (admin|librarian)
--     yang dicek via public.profiles.role.
--   * loans/members/fines/reservations: pemilik data (member sendiri) read
--     (+reservasi bisa buat sendiri), tulis sensitif hanya staff.
--   * service_role & postgres (pemilik tabel) bypass RLS — untuk seed/admin.
-- Rollback: DROP POLICY ... + ALTER TABLE ... DISABLE ROW LEVEL SECURITY
--   (lihat blok bawah). Non-destruktif terhadap data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helper role — SECURITY DEFINER agar tidak rekursi ke policy profiles
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'librarian')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Enable RLS di semua tabel publik CMS
-- ----------------------------------------------------------------------------
ALTER TABLE public.library_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs    ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. KATALOG PUBLIK — read anon, tulis staff
-- ============================================================================

-- ---- library_settings (single row, selalu boleh dibaca publik) ----
DROP POLICY IF EXISTS "public read settings" ON public.library_settings;
CREATE POLICY "public read settings"
  ON public.library_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "staff write settings" ON public.library_settings;
CREATE POLICY "staff write settings"
  ON public.library_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update settings" ON public.library_settings;
CREATE POLICY "staff update settings"
  ON public.library_settings FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete settings" ON public.library_settings;
CREATE POLICY "staff delete settings"
  ON public.library_settings FOR DELETE TO authenticated
  USING (public.is_staff());

-- ---- categories ----
DROP POLICY IF EXISTS "public read categories" ON public.categories;
CREATE POLICY "public read categories"
  ON public.categories FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff read categories" ON public.categories;
CREATE POLICY "staff read categories"
  ON public.categories FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write categories" ON public.categories;
CREATE POLICY "staff write categories"
  ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update categories" ON public.categories;
CREATE POLICY "staff update categories"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete categories" ON public.categories;
CREATE POLICY "staff delete categories"
  ON public.categories FOR DELETE TO authenticated USING (public.is_staff());

-- ---- books ----
DROP POLICY IF EXISTS "public read books" ON public.books;
CREATE POLICY "public read books"
  ON public.books FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff read books" ON public.books;
CREATE POLICY "staff read books"
  ON public.books FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write books" ON public.books;
CREATE POLICY "staff write books"
  ON public.books FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update books" ON public.books;
CREATE POLICY "staff update books"
  ON public.books FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete books" ON public.books;
CREATE POLICY "staff delete books"
  ON public.books FOR DELETE TO authenticated USING (public.is_staff());

-- ---- racks (pendukung katalog: lokasi buku) ----
DROP POLICY IF EXISTS "public read racks" ON public.racks;
CREATE POLICY "public read racks"
  ON public.racks FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff read racks" ON public.racks;
CREATE POLICY "staff read racks"
  ON public.racks FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write racks" ON public.racks;
CREATE POLICY "staff write racks"
  ON public.racks FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update racks" ON public.racks;
CREATE POLICY "staff update racks"
  ON public.racks FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete racks" ON public.racks;
CREATE POLICY "staff delete racks"
  ON public.racks FOR DELETE TO authenticated USING (public.is_staff());

-- ---- banners ----
DROP POLICY IF EXISTS "public read banners" ON public.banners;
CREATE POLICY "public read banners"
  ON public.banners FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff read banners" ON public.banners;
CREATE POLICY "staff read banners"
  ON public.banners FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write banners" ON public.banners;
CREATE POLICY "staff write banners"
  ON public.banners FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update banners" ON public.banners;
CREATE POLICY "staff update banners"
  ON public.banners FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete banners" ON public.banners;
CREATE POLICY "staff delete banners"
  ON public.banners FOR DELETE TO authenticated USING (public.is_staff());

-- ---- articles (hanya published yang publik) ----
DROP POLICY IF EXISTS "public read articles" ON public.articles;
CREATE POLICY "public read articles"
  ON public.articles FOR SELECT TO anon, authenticated
  USING (status = 'published');
DROP POLICY IF EXISTS "staff read articles" ON public.articles;
CREATE POLICY "staff read articles"
  ON public.articles FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write articles" ON public.articles;
CREATE POLICY "staff write articles"
  ON public.articles FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update articles" ON public.articles;
CREATE POLICY "staff update articles"
  ON public.articles FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete articles" ON public.articles;
CREATE POLICY "staff delete articles"
  ON public.articles FOR DELETE TO authenticated USING (public.is_staff());

-- ---- pages ----
DROP POLICY IF EXISTS "public read pages" ON public.pages;
CREATE POLICY "public read pages"
  ON public.pages FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff read pages" ON public.pages;
CREATE POLICY "staff read pages"
  ON public.pages FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff write pages" ON public.pages;
CREATE POLICY "staff write pages"
  ON public.pages FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update pages" ON public.pages;
CREATE POLICY "staff update pages"
  ON public.pages FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete pages" ON public.pages;
CREATE POLICY "staff delete pages"
  ON public.pages FOR DELETE TO authenticated USING (public.is_staff());

-- ---- testimonials / faqs / menus (konten CMS publik) ----
DROP POLICY IF EXISTS "public read testimonials" ON public.testimonials;
CREATE POLICY "public read testimonials"
  ON public.testimonials FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff manage testimonials" ON public.testimonials;
CREATE POLICY "staff manage testimonials"
  ON public.testimonials FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "public read faqs" ON public.faqs;
CREATE POLICY "public read faqs"
  ON public.faqs FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff manage faqs" ON public.faqs;
CREATE POLICY "staff manage faqs"
  ON public.faqs FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "public read menus" ON public.menus;
CREATE POLICY "public read menus"
  ON public.menus FOR SELECT TO anon, authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "staff manage menus" ON public.menus;
CREATE POLICY "staff manage menus"
  ON public.menus FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================================
-- 3. IDENTITAS — profiles & members (milik sendiri atau staff)
-- ============================================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "staff read all profiles" ON public.profiles;
CREATE POLICY "staff read all profiles"
  ON public.profiles FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "staff manage profiles" ON public.profiles;
CREATE POLICY "staff manage profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
-- NOTE: perubahan role oleh user sendiri sebaiknya dicegah di lapisan aplikasi
-- (atau via trigger). Policy di atas + review aplikasi: jangan expose `role`
-- di form profil member.

-- ---- members ----
DROP POLICY IF EXISTS "members read own or staff" ON public.members;
CREATE POLICY "members read own or staff"
  ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "staff insert members" ON public.members;
CREATE POLICY "staff insert members"
  ON public.members FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "members update own or staff" ON public.members;
CREATE POLICY "members update own or staff"
  ON public.members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "staff delete members" ON public.members;
CREATE POLICY "staff delete members"
  ON public.members FOR DELETE TO authenticated USING (public.is_staff());

-- ============================================================================
-- 4. SIRKULASI — loans / reservations / fines (milik sendiri atau staff)
-- ============================================================================

-- ---- loans: baca milik sendiri atau staff; tulis hanya staff ----
DROP POLICY IF EXISTS "loans read own or staff" ON public.loans;
CREATE POLICY "loans read own or staff"
  ON public.loans FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = loans.member_id AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "staff insert loans" ON public.loans;
CREATE POLICY "staff insert loans"
  ON public.loans FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update loans" ON public.loans;
CREATE POLICY "staff update loans"
  ON public.loans FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete loans" ON public.loans;
CREATE POLICY "staff delete loans"
  ON public.loans FOR DELETE TO authenticated USING (public.is_staff());

-- ---- reservations: baca milik sendiri/staff; member boleh buat milik sendiri ----
DROP POLICY IF EXISTS "reservations read own or staff" ON public.reservations;
CREATE POLICY "reservations read own or staff"
  ON public.reservations FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = reservations.member_id AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "reservations insert own or staff" ON public.reservations;
CREATE POLICY "reservations insert own or staff"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = reservations.member_id AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "reservations update own or staff" ON public.reservations;
CREATE POLICY "reservations update own or staff"
  ON public.reservations FOR UPDATE TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = reservations.member_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = reservations.member_id AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "reservations delete own or staff" ON public.reservations;
CREATE POLICY "reservations delete own or staff"
  ON public.reservations FOR DELETE TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = reservations.member_id AND m.user_id = auth.uid()
    )
  );

-- ---- fines: baca milik sendiri/staff; tulis hanya staff ----
DROP POLICY IF EXISTS "fines read own or staff" ON public.fines;
CREATE POLICY "fines read own or staff"
  ON public.fines FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = fines.member_id AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "staff insert fines" ON public.fines;
CREATE POLICY "staff insert fines"
  ON public.fines FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff update fines" ON public.fines;
CREATE POLICY "staff update fines"
  ON public.fines FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff delete fines" ON public.fines;
CREATE POLICY "staff delete fines"
  ON public.fines FOR DELETE TO authenticated USING (public.is_staff());

-- ============================================================================
-- 5. activity_logs — hanya staff yang baca; tulis via service_role/app
-- ============================================================================
DROP POLICY IF EXISTS "staff read logs" ON public.activity_logs;
CREATE POLICY "staff read logs"
  ON public.activity_logs FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "authenticated insert logs" ON public.activity_logs;
CREATE POLICY "authenticated insert logs"
  ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
-- NOTE: tidak ada policy UPDATE/DELETE => log bersifat append-only dari klien.
-- Penghapusan/retensi dilakukan via service_role (bypass RLS) atau SQL dashboard.

-- ============================================================================
-- ROLLBACK (manual):
--   DROP POLICY IF EXISTS ... (semua policy di atas);
--   ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;  -- per tabel
--   DROP FUNCTION IF EXISTS public.is_staff(), public.is_admin();
-- ============================================================================
