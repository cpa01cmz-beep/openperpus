-- ============================================================================
-- 0020_sketch_theme.sql — allow 'sketch' active_theme (6th theme)
-- Non-destruktif: drop CHECK lama 5-id, ganti CHECK 6-id. Aman re-run.
-- Rollback: drop constraint, re-add 5-id check tanpa 'sketch'.
-- ============================================================================

ALTER TABLE public.library_settings
  DROP CONSTRAINT IF EXISTS library_settings_active_theme_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_active_theme_check'
  ) THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_active_theme_check
      CHECK (active_theme IN ('emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch'));
  END IF;
END $$;
