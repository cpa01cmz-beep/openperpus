-- ============================================================================
-- 0035_theme_overrides_layout_only.sql — CHECK theme_overrides layout-only.
-- Non-destruktif: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (IF NOT EXISTS
-- guard), aman dijalankan ulang. Menggantikan CHECK longgar 0022 yang
-- mengizinkan top-level keys tokens/fonts/radius/shadow/spacing/layout.
--
-- Alasan (no-hardcoded): nilai token (hex, shadow, radius, spacing, font)
-- single-source di src/lib/themes.ts. theme_overrides hanya boleh mengatur
-- `layout` (varian header/hero/footer + homepageSections); lapisan API
-- (ThemeOverridesLayoutSchema, 422 LOCKED_THEME_MESSAGE) sudah menolak
-- tokens/* — CHECK ini menutup celah tulis langsung ke DB (service-role)
-- agar DB = API.
-- Rollback: DROP CONSTRAINT library_settings_theme_overrides_check, lalu
-- jalankan ulang blok 0022 (CHECK lama) bila diperlukan.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_theme_overrides_check'
  ) THEN
    ALTER TABLE public.library_settings
      DROP CONSTRAINT library_settings_theme_overrides_check;
  END IF;
END $$;

-- Bentuk ketat: harus object JSON, <=8000 char, SATU-SATUNYA top-level key
-- yang diizinkan adalah `layout`. (theme_overrides - ARRAY['layout']) = '{}'
-- memastikan tak ada kunci asing tanpa subquery (CHECK tidak mengizinkan
-- sub-SELECT).
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
          AND (theme_overrides - ARRAY['layout']) = '{}'::jsonb
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.library_settings.theme_overrides IS 'Override layout per-tema (layout-only: satu-satunya top-level key = layout; tokens/fonts/radius/shadow/spacing single-source di src/lib/themes.ts). NULL = pakai bawaan THEMES.';
