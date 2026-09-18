-- ============================================================================
-- 0007_storage_guard.sql — S-sec-rls storage hardening (NEW FILE, no edit to 0004)
-- Bucket library-assets stays PUBLIC read; writes stay staff-only.
-- Changes vs 0004_storage.sql:
--   1. Strip 'image/svg+xml' from allowed_mime_types (stored-XSS vector).
--      Client check in src/components/admin/UploadInput.tsx is bypassable,
--      so the bucket list is the authoritative guard.
--   2. Folder allowlist on INSERT/UPDATE: logo/covers/banners/articles/avatars/ebooks.
--      Rejects stray top-level or unexpected prefixes while keeping staff flow green.
-- Rollback: re-run 0004_storage.sql bucket upsert to restore prior mime list,
--   then DROP POLICY "staff insert library-assets" / "staff update library-assets"
--   and re-create them from 0004 (without the name ~ folder predicate).
-- ============================================================================

-- 1. Authoritative mime list without svg (10MB limit unchanged).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf'
]
WHERE id = 'library-assets';

-- 2. INSERT staff + folder allowlist.
DROP POLICY IF EXISTS "staff insert library-assets" ON storage.objects;
CREATE POLICY "staff insert library-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library-assets'
    AND public.is_staff()
    AND name ~ '^(logo|covers|banners|articles|avatars|ebooks)/'
  );

-- 3. UPDATE staff + folder allowlist (same predicate on USING + WITH CHECK).
DROP POLICY IF EXISTS "staff update library-assets" ON storage.objects;
CREATE POLICY "staff update library-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'library-assets'
    AND public.is_staff()
    AND name ~ '^(logo|covers|banners|articles|avatars|ebooks)/'
  )
  WITH CHECK (
    bucket_id = 'library-assets'
    AND public.is_staff()
    AND name ~ '^(logo|covers|banners|articles|avatars|ebooks)/'
  );
