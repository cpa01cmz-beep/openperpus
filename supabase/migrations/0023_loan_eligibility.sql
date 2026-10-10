-- ============================================================================
-- 0023_loan_eligibility.sql — Batas pinjaman aktif per anggota (gate checkout)
-- Isu #56: POST /loans & POST /reservations hanya cek status=active; anggota
--   berdenda/over-limit tetap bisa checkout. Kolom baru menampung batas
--   operasional supaya bisa diubah pustakawan tanpa deploy.
-- Sifat: aditif + idempotent (ADD COLUMN IF NOT EXISTS), non-destruktif.
-- Rollback (manual): ALTER TABLE public.library_settings
--   DROP COLUMN IF EXISTS max_active_loans;
-- ============================================================================

ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS max_active_loans INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.library_settings.max_active_loans IS
  'Maksimum loan aktif (borrowed/overdue) per anggota sebelum checkout baru ditolak (409). Default 3.';
