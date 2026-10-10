-- ============================================================================
-- 0022_theme_overrides.sql — kolom theme_overrides (layout-only, Fase 1)
-- Non-destruktif: ADD COLUMN IF NOT EXISTS, aman dijalankan ulang.
-- CHECK(id=1) dari 0001_core.sql dan CHECK active_theme (0020) tetap utuh.
-- Fase 1: hanya kunci `layout` yang dipakai aplikasi; CHECK mengizinkan
-- top-level keys tokens/fonts/radius/shadow/spacing/layout untuk masa depan
-- (aturan "tema dikunci, hanya layout" ditegakkan di lapisan API, bukan DB).
-- Rollback: ALTER TABLE public.library_settings DROP CONSTRAINT IF EXISTS
--   library_settings_theme_overrides_check; ALTER TABLE public.library_settings
--   DROP COLUMN IF EXISTS theme_overrides;
-- CATATAN NOMOR: memakai 0022 karena 0021 sudah terpakai oleh
--   0021_services.sql (duplikasi prefix merusak urutan migrasi leksikografis).
-- ============================================================================

ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS theme_overrides JSONB NULL DEFAULT NULL;

-- Bentuk ringan: harus object JSON, <=8000 char, top-level keys terbatas.
-- (theme_overrides - ARRAY[...]) = '{}' memastikan tak ada kunci asing
-- tanpa subquery (CHECK tidak mengizinkan sub-SELECT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_theme_overrides_check'
  ) THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_theme_overrides_check
      CHECK (
        theme_overrides IS NULL
        OR (
          jsonb_typeof(theme_overrides) = 'object'
          AND octet_length(theme_overrides::text) <= 8000
          AND (theme_overrides - ARRAY['tokens', 'fonts', 'radius', 'shadow', 'spacing', 'layout']) = '{}'::jsonb
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.library_settings.theme_overrides IS 'Override layout per-tema (Fase 1: hanya kunci layout dipakai; tokens/fonts/radius/shadow/spacing dicadangkan untuk masa depan). NULL = pakai bawaan THEMES.';
