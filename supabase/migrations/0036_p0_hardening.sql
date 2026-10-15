-- ============================================================================
-- 0036_p0_hardening.sql — P0 DB hardening (non-destruktif, aditif)
-- Isi: STABLE helper + indeks FK + penanda docstring decrement stok
--   (non-concurrent agar aman dalam transaksi migrasi).
-- CATATAN: perbaikan decrement stok kondisional checkout_reservation_tx
--   TIDAK diterapkan di sini. 0024 sudah pernah jalan di lingkungan
--   ter-deploy, jadi editnya tak akan dieksekusi ulang. Implementasinya
--   ada di 0037_reapply_checkout_stock_guard.sql (CREATE OR REPLACE —
-- pola sama dengan 0033 untuk 0032).
-- Rollback: DROP INDEX IF EXISTS <nama_idx>; ALTER FUNCTION ... VOLATILE
--   (kembalikan default); COMMENT ON FUNCTION ... IS NULL;
--   DROP INDEX/undo 0037 lihat komentar rollback di 0037.
-- ============================================================================

-- 1. Helper RLS: tandai STABLE agar planner bisa inline/cache per-statement
--    (fungsi hanya SELECT; sebelumnya VOLATILE default = evaluasi berlebih).
ALTER FUNCTION public.is_staff() STABLE;
ALTER FUNCTION public.is_admin() STABLE;

-- 2. Indeks FK / jalur panas (IF NOT EXISTS; non-concurrent agar aman
--    dijalankan dalam satu transaksi migrasi via `supabase db push`/psql).
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON public.payments (received_by);
CREATE INDEX IF NOT EXISTS idx_fine_waivers_requested_by ON public.fine_waivers (requested_by);
CREATE INDEX IF NOT EXISTS idx_fine_waivers_fine_status ON public.fine_waivers (fine_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_member_status ON public.loans (member_id, status);

-- 3. Docstring penanda untuk race decrement stok checkout_reservation_tx.
--    Perbaikan NYATA ada di 0037_reapply_checkout_stock_guard.sql (file
--    terApply CREATE OR REPLACE, agar DB yang sudah menjalankan 0024 ikut
--    menerima). COMMENT ini hanya jejak dokumentasi di katalog DB.
COMMENT ON FUNCTION public.checkout_reservation_tx(uuid, timestamptz, timestamptz, text) IS 'P0: decrement stok WAJIB kondisional WHERE stock_available>0 + IF NOT FOUND RAISE 25000; lihat 0005_checkout.sql pola benar & 0037_reapply_checkout_stock_guard.sql implementasinya.';
