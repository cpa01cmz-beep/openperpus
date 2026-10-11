-- ============================================================================
-- 0029_issue75_soft_delete.sql — soft-delete members (#75, minimum AC)
-- Masalah: DELETE members/buku menghapus histori (loans CASCADE dari members).
-- Fix minimum:
--   1. members.deleted_at timestamptz (NULL = aktif). API memakai UPDATE
--      deleted_at=NOW() + anonimisasi phone/address -> NULL, bukan DELETE.
--   2. books sudah punya is_active — pakai itu (is_active=false = soft).
-- Sifat: idempoten (IF NOT EXISTS). SKIP bagian FK: overlap dengan PR #104
--   (0028_issue67_fk_stock_fine.sql tidak ada di worktree ini); FK
--   members loans ON DELETE CASCADE dibiarkan — ditangani PR #104 -> RESTRICT.
-- Rollback: DROP INDEX IF EXISTS idx_members_deleted_at;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS deleted_at;
-- ============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_members_deleted_at
  ON public.members (deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.members.deleted_at IS
  'Soft-delete (#75): NULL = aktif; terisi = dihapus + phone/address dianonimkan. Histori loans tetap ada.';
