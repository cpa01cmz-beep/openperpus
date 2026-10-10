-- ============================================================================
-- 0021_services.sql — Tabel layanan dinamis (kartu Layanan)
-- Dependensi: 0001_core.sql (helper handle_updated_at), 0002_rls.sql
--   (fungsi is_staff()/is_admin(), pola policy menus).
-- Pola yang ditiru:
--   * Tabel + index ala 0001 (banners/testimonials/faqs/menus: sort + active).
--   * RLS ala menus di 0002: anon read is_active, staff manage (FOR ALL).
--   * Trigger updated_at ala 0001 (handle_updated_at).
-- Sifat: idempotent (IF NOT EXISTS / DROP IF EXISTS), non-destruktif.
-- Rollback (manual): DELETE FROM public.services; DROP TRIGGER IF EXISTS
--   trg_services_updated_at ON public.services;
--   DROP POLICY IF EXISTS "public read services" ON public.services;
--   DROP POLICY IF EXISTS "staff manage services" ON public.services;
--   DROP TABLE IF EXISTS public.services;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel public.services
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'book'
              CHECK (icon IN ('book', 'catalog', 'users', 'clock', 'info', 'star')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.services IS 'Kartu layanan dinamis (halaman /layanan).';

-- ----------------------------------------------------------------------------
-- 2. Index — jalur panas: filter is_active + sort sort_order
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_sort
  ON public.services (is_active, sort_order);

-- ----------------------------------------------------------------------------
-- 3. RLS — tiru persis pola menus di 0002_rls.sql
-- ----------------------------------------------------------------------------
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read services" ON public.services;
CREATE POLICY "public read services"
  ON public.services FOR SELECT TO anon, authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS "staff manage services" ON public.services;
CREATE POLICY "staff manage services"
  ON public.services FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ----------------------------------------------------------------------------
-- 4. Trigger updated_at (pola 0001: handle_updated_at)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Seed 4 baris (tanpa id hardcoded; idempotent via cek title)
-- ----------------------------------------------------------------------------
INSERT INTO public.services (title, description, icon, sort_order)
SELECT v.title, v.description, v.icon, v.sort_order
FROM (VALUES
  ('Peminjaman & Pengembalian', 'Pinjam koleksi fisik dengan kartu anggota. Perpanjang masa pinjam sebelum jatuh tempo agar terhindar dari denda.', 'book', 0),
  ('Katalog Daring (OPAC)', 'Telusuri seluruh koleksi dari ponsel — cek ketersediaan, lokasi rak, dan status stok secara real-time.', 'catalog', 1),
  ('Keanggotaan', 'Daftar menjadi anggota untuk meminjam, mereservasi buku, dan menerima kabar kegiatan literasi.', 'users', 2),
  ('Reservasi & Antrean', 'Buku yang sedang dipinjam bisa diantre. Anda akan dihubungi petugas saat eksemplar tersedia.', 'clock', 3)
) AS v (title, description, icon, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.title = v.title
);
