-- ============================================================================
-- 0026_loan_policy.sql — Kebijakan pinjam jadi pengaturan, bukan hardcode (#74)
-- Masalah (issue #74):
--   1. lama pinjam default +14 hari di-hardcode di API (POST /api/loans) dan
--      LoanForm.tsx — pustakawan tak bisa mengubahnya tanpa deploy.
--   2. batas perpanjangan dihitung dari activity_logs (extendLoan.ts): rapuh
--      bila log diprune retensi 180 hari → anggota bisa memperpanjang tanpa
--      batas. Harus kolom loans.extend_count yang ikut transaksi.
--   3. return kondisi 'rusak'/'hilang' hanya mengurangi stock_total, tanpa
--      biaya ganti rugi tercatat → buku hilang tercatat "baik" secara finansial.
-- Fix:
--   1. library_settings.loan_days (default 14) — checkout memakainya.
--   2. loans.extend_count NOT NULL DEFAULT 0 + extend_loan menaikkan kolom itu
--      dan menolak (40901) bila sudah mencapai library_settings.max_extensions.
--   3. library_settings.replacement_fee_damaged / replacement_fee_lost —
--      return_loan menambahkannya ke denda telat dan menulis 1 baris fines.
-- Sifat: aditif + idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
--   constraint/kolom baru berpola "kolom lama nullable" agar baris historis
--   tetap valid). return_loan TIDAK berubah signature (panggil lama tetap jalan).
-- Rollback: DROP FUNCTION IF EXISTS public.extend_loan(uuid, int, int);
--   jalankan ulang 0018_perf_fixes.sql (tanpa extend_count);
--   DROP FUNCTION IF EXISTS public.return_loan(uuid, timestamptz, text, text, uuid, numeric);
--   jalankan ulang 0014_fine_rate.sql; lalu
--   ALTER TABLE public.loans DROP COLUMN IF EXISTS extend_count;
--   ALTER TABLE public.library_settings
--     DROP COLUMN IF EXISTS loan_days, DROP COLUMN IF EXISTS max_extensions,
--     DROP COLUMN IF EXISTS replacement_fee_damaged, DROP COLUMN IF EXISTS replacement_fee_lost;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. library_settings — kebijakan pinjam (additive, idempotent)
--    Nama kolom kanonis Inggris (lihat issue #71): Indonesia hanya label UI.
-- ----------------------------------------------------------------------------
ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS loan_days INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS max_extensions INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS replacement_fee_damaged NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_fee_lost NUMERIC(12, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_loan_days_check') THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_loan_days_check CHECK (loan_days BETWEEN 1 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_max_extensions_check') THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_max_extensions_check CHECK (max_extensions BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_replacement_fee_damaged_check') THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_replacement_fee_damaged_check CHECK (replacement_fee_damaged >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_replacement_fee_lost_check') THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_replacement_fee_lost_check CHECK (replacement_fee_lost >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.library_settings.loan_days IS
  'Lama pinjam default (hari) untuk checkout tanpa due_at eksplisit. Default 14.';
COMMENT ON COLUMN public.library_settings.max_extensions IS
  'Maksimum perpanjangan per pinjaman (dipakai extend_loan + extendLoan.ts). Default 2.';
COMMENT ON COLUMN public.library_settings.replacement_fee_damaged IS
  'Biaya ganti rugi (Rp) saat buku dikembalikan rusak — masuk denda. Default 0.';
COMMENT ON COLUMN public.library_settings.replacement_fee_lost IS
  'Biaya ganti rugi (Rp) saat buku dilaporkan hilang — masuk denda. Default 0.';

-- ----------------------------------------------------------------------------
-- 2. loans.extend_count — jumlah perpanjangan yang sudah dipakai (sumber utama).
--    Baris historis di-backfill dari activity_logs SEKALI saja (best-effort)
--    supaya limit tetap berlaku untuk pinjaman lama; log yang diprune tidak
--    lagi menjadi penghitung otoritatif setelah backfill.
-- ----------------------------------------------------------------------------
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS extend_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loans_extend_count_check') THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_extend_count_check CHECK (extend_count >= 0);
  END IF;
END $$;

UPDATE public.loans l
SET extend_count = COALESCE(c.cnt, 0)
FROM (
  SELECT entity_id, count(*)::int AS cnt
  FROM public.activity_logs
  WHERE entity_type = 'loans' AND action = 'loans.extend'
  GROUP BY entity_id
) c
WHERE l.id::text = c.entity_id
  AND l.extend_count < c.cnt;

COMMENT ON COLUMN public.loans.extend_count IS
  'Jumlah perpanjangan yang sudah dipakai (dipakai extend_loan + extendLoan.ts).';

-- ----------------------------------------------------------------------------
-- 3. extend_loan v2 — batas perpanjangan + extend_count atomik di DB.
--    Batas: COALESCE(p_max_extend, library_settings.max_extensions, 2) supaya
--    UI dan DB memakai angka yang sama (max_extensions bisa diubah pustakawan).
--    Kontrak error: 40901 batas perpanjangan tercapai / pinjaman sudah selesai.
--    RETURNS TABLE mendapat extend_count (kolom baru di akhir — aman utk
--    pemanggil yang membaca nama kolom).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.extend_loan(uuid, int);

CREATE OR REPLACE FUNCTION public.extend_loan(
  p_loan_id uuid,
  p_days int,
  p_max_extend int DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  book_id uuid,
  member_id uuid,
  borrowed_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  status text,
  fine_amount numeric(12, 2),
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  is_overdue boolean,
  extend_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_loan RECORD;
  v_new_due timestamptz;
  v_max_extend int;
BEGIN
  -- Validasi days 1..90
  IF p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'days harus bilangan bulat 1..90' USING ERRCODE = '22003';
  END IF;

  v_max_extend := COALESCE(
    p_max_extend,
    (SELECT s.max_extensions FROM public.library_settings s WHERE s.id = 1),
    2
  );
  v_max_extend := GREATEST(0, v_max_extend);

  -- SELECT FOR UPDATE untuk lock row & cek status
  SELECT *
  INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjaman tidak ditemukan' USING ERRCODE = 'P0001';
  END IF;

  IF v_loan.status IN ('returned', 'lost') THEN
    RAISE EXCEPTION 'Peminjaman sudah selesai, tidak bisa diperpanjang' USING ERRCODE = '40901';
  END IF;

  -- Batas perpanjangan dari kolom extend_count (bukan activity_logs).
  IF COALESCE(v_loan.extend_count, 0) >= v_max_extend THEN
    RAISE EXCEPTION 'Batas maksimum perpanjangan tercapai (maksimal % kali).', v_max_extend
      USING ERRCODE = '40901';
  END IF;

  -- Hitung new due_at
  v_new_due := v_loan.due_at + (p_days || ' days')::interval;

  -- Update due_at + extend_count dalam satu transaksi
  UPDATE public.loans
  SET due_at = v_new_due,
      extend_count = COALESCE(extend_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_loan_id;

  -- Return updated row + is_overdue + extend_count
  RETURN QUERY
  SELECT
    l.id,
    l.book_id,
    l.member_id,
    l.borrowed_at,
    l.due_at,
    l.returned_at,
    l.status,
    l.fine_amount,
    l.notes,
    l.created_at,
    l.updated_at,
    (l.due_at < NOW()) AS is_overdue,
    COALESCE(l.extend_count, 0) AS extend_count
  FROM public.loans l
  WHERE l.id = p_loan_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.extend_loan(uuid, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.extend_loan(uuid, int, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. return_loan v3 — denda telat + biaya ganti rugi rusak/hilang.
--    Signature TIDAK berubah (panggil lama tetap jalan); biaya ganti rugi
--    dibaca dari library_settings (fungsi SECURITY DEFINER).
--    Acuan rinciannya ditulis ke notes loan + notes fines + metadata audit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_loan(
  p_loan_id uuid,
  p_returned_at timestamptz DEFAULT now(),
  p_kondisi text DEFAULT 'baik',
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_fine_per_day numeric DEFAULT 1000
)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_loan public.loans;
  v_book_id uuid;
  v_member_id uuid;
  v_due_at timestamptz;
  v_fine numeric(12, 2);
  v_late_fine numeric(12, 2);
  v_replacement numeric(12, 2);
  v_rate numeric(12, 2);
  v_status text;
  v_notes text;
  v_note_suffix text;
  v_fine_note text;
BEGIN
  IF NOT public.is_staff() AND NOT EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.members m ON m.id = l.member_id
    WHERE l.id = p_loan_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tidak berhak mengembalikan peminjaman ini.' USING ERRCODE = '42501';
  END IF;

  SELECT l.* INTO v_loan FROM public.loans l WHERE l.id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjaman tidak ditemukan.' USING ERRCODE = '02000';
  END IF;

  IF v_loan.status = 'returned' OR v_loan.status = 'lost' THEN
    RAISE EXCEPTION 'Sudah dikembalikan.' USING ERRCODE = '25001';
  END IF;

  IF p_kondisi NOT IN ('baik', 'rusak', 'hilang') THEN
    RAISE EXCEPTION 'kondisi harus: baik|rusak|hilang.' USING ERRCODE = '22000';
  END IF;

  v_rate := GREATEST(1, COALESCE(NULLIF(p_fine_per_day, NULL), 1000));
  v_book_id := v_loan.book_id;
  v_member_id := v_loan.member_id;
  v_due_at := v_loan.due_at;

  v_late_fine := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
    date_trunc('day', p_returned_at) - date_trunc('day', v_due_at)
  )) / 86400)) * v_rate;

  -- Biaya ganti rugi: hanya untuk rusak/hilang (0 bila belum diatur pustakawan).
  v_replacement := CASE p_kondisi
    WHEN 'rusak' THEN COALESCE(
      (SELECT s.replacement_fee_damaged FROM public.library_settings s WHERE s.id = 1), 0)
    WHEN 'hilang' THEN COALESCE(
      (SELECT s.replacement_fee_lost FROM public.library_settings s WHERE s.id = 1), 0)
    ELSE 0
  END;
  v_replacement := GREATEST(0, v_replacement);

  v_fine := v_late_fine + v_replacement;

  IF p_kondisi = 'hilang' THEN
    v_status := 'lost';
  ELSE
    v_status := 'returned';
  END IF;
  v_note_suffix := CASE
    WHEN p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN ' | ' || btrim(p_notes)
    ELSE ''
  END;
  v_notes := 'Kondisi kembali: ' || p_kondisi || v_note_suffix;

  v_fine_note := 'Denda keterlambatan otomatis Rp' || v_rate || '/hari (due ' || v_due_at || ').'
    || CASE WHEN v_replacement > 0
      THEN ' Biaya ganti rugi (' || p_kondisi || '): Rp' || v_replacement || '.'
      ELSE '' END
    || ' Kondisi: ' || p_kondisi || '.';

  UPDATE public.loans
     SET returned_at = p_returned_at,
         status = v_status,
         fine_amount = v_fine,
         notes = v_notes,
         updated_at = now()
   WHERE id = p_loan_id
   RETURNING * INTO v_loan;

  IF p_kondisi = 'baik' THEN
    UPDATE public.books
       SET stock_available = LEAST(stock_total, stock_available + 1),
           updated_at = now()
     WHERE id = v_book_id;
  ELSE
    UPDATE public.books
       SET stock_total = GREATEST(0, stock_total - 1),
           stock_available = LEAST(GREATEST(0, stock_total - 1), stock_available),
           updated_at = now()
     WHERE id = v_book_id;
  END IF;

  IF v_fine > 0 THEN
    INSERT INTO public.fines (loan_id, member_id, amount, status, notes)
    VALUES (v_loan.id, v_loan.member_id, v_fine, 'unpaid', v_fine_note);
  END IF;

  BEGIN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (p_user_id, 'loans.return', 'loans', p_loan_id,
            jsonb_build_object(
              'fine', v_fine,
              'late_fine', v_late_fine,
              'replacement_fee', v_replacement,
              'kondisi', p_kondisi,
              'book_id', v_loan.book_id,
              'fine_per_day', v_rate
            ));
  EXCEPTION WHEN OTHERS THEN
    -- Log audit failure but don't fail the return.
    RAISE NOTICE 'audit log insert failed: %', SQLERRM;
  END;

  RETURN v_loan;
END;
$func$;

REVOKE ALL ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid, numeric) TO authenticated;
