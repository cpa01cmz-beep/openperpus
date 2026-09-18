-- ============================================================================
-- 0006_content.sql — Pelengkap konten CMS (pages/faqs/testimonials/menus)
-- Dependensi: 0001_core.sql (tabel + kolom), 0002_rls.sql (policy baca publik)
-- Hasil cek UI vs schema:
--   * pages/faqs/testimonials/menus + RLS SELECT publik (is_active) + index
--     SUDAH ADA di 0001/0002 — tidak diduplikasi di sini.
--   * Yang BELUM ada dan dibutuhkan kontrak API §7 + admin konten:
--     1. pages.show_in_menu (kontrak: tampil di menu navigasi)
--     2. INSERT testimoni oleh publik (anon/member) yang WAJIB nonaktif
--        (moderasi staf) — tanpa ini form testimoni publik gagal RLS.
-- Sifat: idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), non-destruktif.
--   JANGAN ubah file 0001/0002/0003 — semua perubahan hanya di file ini.
-- Rollback: DROP POLICY "public insert testimonials (moderation)" ...;
--   ALTER TABLE public.pages DROP COLUMN show_in_menu;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pages.show_in_menu — default FALSE agar halaman lama tidak tiba-tiba
--    muncul di navigasi; staf mengaktifkan eksplisit via PUT /api/pages.
-- ----------------------------------------------------------------------------
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS show_in_menu BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pages.show_in_menu IS
  'Tampil di menu navigasi (diatur staf; default FALSE).';

CREATE INDEX IF NOT EXISTS idx_pages_menu
  ON public.pages (show_in_menu) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 2. Testimoni publik (moderasi): anon + member boleh INSERT, tetapi hanya
--    baris nonaktif (WITH CHECK is_active = FALSE). Approve dilakukan staf
--    via PUT /api/testimonials (policy staff manage di 0002 tetap berlaku,
--    RLS lolos bila SALAH SATU policy permissive terpenuhi).
--    Lapisan API memaksa is_active=false untuk non-staf (defense in depth).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "public insert testimonials (moderation)" ON public.testimonials;
CREATE POLICY "public insert testimonials (moderation)"
  ON public.testimonials FOR INSERT TO anon, authenticated
  WITH CHECK (is_active = FALSE);
