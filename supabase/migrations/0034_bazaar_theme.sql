-- ============================================================================
-- 0034_bazaar_theme.sql — allow 'bazaar' active_theme (7th theme)
-- Non-destruktif: drop CHECK lama 6-id, ganti CHECK 7-id. Aman re-run.
-- Rollback: drop constraint, re-add 6-id check tanpa 'bazaar'.
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
      CHECK (active_theme IN ('emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch', 'bazaar'));
  END IF;
END $$;
