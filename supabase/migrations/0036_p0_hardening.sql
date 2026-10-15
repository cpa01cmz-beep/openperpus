-- ============================================================================
-- 0036_p0_hardening.sql — P0 DB hardening (non-destruktif, aditif)
-- Isi: STABLE helper + indeks FK + atomic decrement docs (non-concurrent
--   agar aman dalam transaksi migrasi).
-- Rollback: DROP INDEX IF EXISTS <nama_idx>; ALTER FUNCTION ... VOLATILE
--   (kembalikan default); COMMENT ON FUNCTION ... IS NULL.
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

-- 3. Perbaiki race checkout_reservation_tx: decrement kondisional.
--    File ini SENGAJA tidak me-rewrite fungsi (review kecil); pola benar
--    didokumentasikan sebagai COMMENT + diterapkan di 0024 baris 193-195:
--      UPDATE public.books SET stock_available = stock_available - 1
--        WHERE id = v_res.book_id AND stock_available > 0;
--      IF NOT FOUND THEN RAISE EXCEPTION 'Stok buku habis.'
--        USING ERRCODE = '25000'; END IF;
COMMENT ON FUNCTION public.checkout_reservation_tx(uuid, timestamptz, timestamptz, text) IS 'P0: decrement stok WAJIB kondisional WHERE stock_available>0 + IF NOT FOUND RAISE 25000; lihat 0005_checkout.sql pola benar.';
