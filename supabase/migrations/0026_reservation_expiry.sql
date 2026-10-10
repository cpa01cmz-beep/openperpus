-- ============================================================================
-- 0026_reservation_expiry.sql — Expiry wajib + sweep reservasi kedaluwarsa
-- Isu #76: sweep hanya tombol manual; baris lama expires_at NULL selamanya.
--   1. Backfill NULL lama → reserved_at + 3 hari (nawaitu asli; yang lewat
--      langsung jadi kandidat sweep).
--   2. expires_at DEFAULT NOW()+3 hari + NOT NULL (baris baru selalu terisi).
--   3. RPC sweep_expired_reservations() — pending/ready + expires_at<NOW()
--      → expired, return jumlah baris. Dipanggil Vercel Cron
--      GET /api/cron/sweep-reservations (vercel.json) — repo tanpa konvensi
--      pg_cron di semua migrasi, deploy ke Vercel (ADR-002).
-- Sifat: aditif + idempotent, non-destruktif. Tanpa kolom overdue / tanpa
--   mark_overdue_loans (overdue = turunan via due_at<NOW(), PR #87).
-- Rollback (manual): DROP FUNCTION public.sweep_expired_reservations();
--   DROP INDEX public.idx_reservations_sweep;
--   ALTER TABLE public.reservations ALTER COLUMN expires_at DROP NOT NULL;
--   ALTER TABLE public.reservations ALTER COLUMN expires_at DROP DEFAULT;
-- ============================================================================

-- 1. Backfill NULL lama (selalu > reserved_at → CHECK 0001 tetap holds).
UPDATE public.reservations
SET expires_at = reserved_at + INTERVAL '3 days'
WHERE expires_at IS NULL;

-- 2. Default + NOT NULL untuk baris baru.
ALTER TABLE public.reservations
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '3 days');

ALTER TABLE public.reservations
  ALTER COLUMN expires_at SET NOT NULL;

-- Index parsial untuk sweep (hanya pending/ready).
CREATE INDEX IF NOT EXISTS idx_reservations_sweep
  ON public.reservations (status, expires_at)
  WHERE status IN ('pending', 'ready');

-- 3. RPC sweep: atomik 1 statement, return jumlah baris ter-update.
CREATE OR REPLACE FUNCTION public.sweep_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.reservations
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('pending', 'ready')
    AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$func$;

REVOKE ALL ON FUNCTION public.sweep_expired_reservations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sweep_expired_reservations() TO authenticated, service_role;
