-- ============================================================================
-- 0016_articles_trgm.sql — Trigram GIN indexes for articles search
-- Membuat WHERE title ILIKE '%needle%' / excerpt ILIKE '%needle%' memakai
-- Bitmap Index Scan via GIN (pg_trgm). Tanpa ini: Seq Scan full-table.
-- Dependensi: 0001_core.sql (articles table), 0012_perf.sql (pg_trgm extension)
-- Non-destruktif: CREATE IF NOT EXISTS. Aman rerun.
-- Rollback: DROP INDEX IF EXISTS idx_articles_title_trgm_gin, idx_articles_excerpt_trgm_gin;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extension pg_trgm (idempotent — sudah di 0012_perf.sql, tapi safe rerun)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 2. GIN trigram indexes untuk articles.title dan articles.excerpt
--    Membuat pencarian fuzzy / partial match cepat.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm_gin
  ON public.articles USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_articles_excerpt_trgm_gin
  ON public.articles USING gin (excerpt gin_trgm_ops);

-- Index btree yang sudah ada di 0001 (idx_articles_status_pub, idx_articles_category, idx_articles_author)
-- tetap dipertahankan untuk filter/sort; GIN di atas melayani %needle%.