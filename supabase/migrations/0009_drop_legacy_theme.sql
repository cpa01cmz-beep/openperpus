-- ============================================================================
-- 0009_drop_legacy_theme.sql — hapus kolom theme duplikat (single-source theme)
-- Single source: library_settings.active_theme (5 id: emerald/midnight/paper/
-- brutalist/ocean) via ThemeSwitcher. Kolom theme_primary/theme_accent DEAD:
-- tidak dibaca render mana pun (grep src/ hanya SettingsForm + types).
-- Backup nilai 2026-09-18 sebelum drop: theme_primary='#1e40af',
-- theme_accent='#f59e0b' (default seed, tidak pernah dipakai render).
-- Non-destruktif selain drop 2 kolom mati: IF EXISTS, aman dijalankan ulang.
-- Rollback: ALTER TABLE public.library_settings
--   ADD COLUMN IF NOT EXISTS theme_primary TEXT NOT NULL DEFAULT '#1e40af';
--   ADD COLUMN IF NOT EXISTS theme_accent TEXT NOT NULL DEFAULT '#f59e0b';
-- ============================================================================

ALTER TABLE public.library_settings
  DROP COLUMN IF EXISTS theme_primary;

ALTER TABLE public.library_settings
  DROP COLUMN IF EXISTS theme_accent;
