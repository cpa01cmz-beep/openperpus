-- ============================================================================
-- 0008_theme.sql — active_theme persistence (single-row library_settings)
-- Non-destruktif: ADD COLUMN IF NOT EXISTS, aman dijalankan ulang.
-- CHECK(id=1) dari 0001_core.sql tetap utuh, tidak diubah.
-- Rollback: ALTER TABLE public.library_settings DROP CONSTRAINT IF EXISTS
--   library_settings_active_theme_check; ALTER TABLE public.library_settings
--   DROP COLUMN IF EXISTS active_theme;
-- ============================================================================

ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS active_theme TEXT DEFAULT 'emerald';

-- Backfill baris lama yang NULL (mis. seed sebelum kolom ini ada).
UPDATE public.library_settings
  SET active_theme = 'emerald'
  WHERE active_theme IS NULL;

ALTER TABLE public.library_settings
  ALTER COLUMN active_theme SET DEFAULT 'emerald';

-- Batasi ke 5 id tema yang dikenal. Guard IF NOT EXISTS via pg_constraint
-- agar re-run tidak gagal (ADD CONSTRAINT tak punya IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_active_theme_check'
  ) THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_active_theme_check
      CHECK (active_theme IN ('emerald', 'midnight', 'paper', 'brutalist', 'ocean'));
  END IF;
END $$;
