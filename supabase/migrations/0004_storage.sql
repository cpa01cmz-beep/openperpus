-- ============================================================================
-- 0004_storage.sql — Bucket & policy Storage CMS Perpustakaan
-- Dependensi: 0002_rls.sql (public.is_staff()), storage.buckets/objects
-- Bucket: library-assets (PUBLIC) dengan konvensi folder:
--   logo/  covers/  banners/  articles/  avatars/  ebooks/
-- Rollback: DROP POLICY ... ON storage.objects; lalu
--   DELETE FROM storage.objects WHERE bucket_id='library-assets';
--   DELETE FROM storage.buckets WHERE id='library-assets';
--   (HANYA bila bucket kosong / sudah dibackup — destruktif, konfirmasi mandor)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket public library-assets (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'library-assets',
  'library-assets',
  TRUE,
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/svg+xml', 'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. Policies storage.objects untuk bucket library-assets
--    * Public read (anon + authenticated) — file katalog/CMS memang publik.
--    * Tulis (insert/update/delete) hanya staff (admin|librarian).
--    * service_role bypass RLS (untuk seed / job server).
-- ----------------------------------------------------------------------------

-- ---- READ publik ----
DROP POLICY IF EXISTS "public read library-assets" ON storage.objects;
CREATE POLICY "public read library-assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'library-assets');

-- ---- INSERT staff ----
DROP POLICY IF EXISTS "staff insert library-assets" ON storage.objects;
CREATE POLICY "staff insert library-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library-assets'
    AND public.is_staff()
  );

-- ---- UPDATE staff ----
DROP POLICY IF EXISTS "staff update library-assets" ON storage.objects;
CREATE POLICY "staff update library-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'library-assets' AND public.is_staff())
  WITH CHECK (bucket_id = 'library-assets' AND public.is_staff());

-- ---- DELETE staff ----
DROP POLICY IF EXISTS "staff delete library-assets" ON storage.objects;
CREATE POLICY "staff delete library-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'library-assets' AND public.is_staff());

-- ----------------------------------------------------------------------------
-- 3. Catatan operasional (tidak dieksekusi):
--  * Upload via supabase-js: supabase.storage.from('library-assets')
--      .upload('covers/<slug>.jpg', file, { upsert: true })
--  * URL publik: supabase.storage.from('library-assets')
--      .getPublicUrl('covers/<slug>.jpg')
--  * Batas 10 MB; PDF hanya relevan di folder ebooks/ (validasi tambahan
--    di aplikasi: tolak PDF di folder logo/covers/banners).
--  * Bila butuh folder privat (mis. KTP anggota), buat bucket terpisah
--    `library-private` (private) — JANGAN campur ke bucket publik ini.
-- ----------------------------------------------------------------------------
