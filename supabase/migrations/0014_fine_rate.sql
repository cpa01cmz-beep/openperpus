-- ============================================================================
-- 0014_fine_rate.sql — tarif denda configurable (S-roi8)
-- Additive only: ADD COLUMN IF NOT EXISTS fine_per_day + return_loan gets
-- optional p_fine_per_day (DEFAULT 1000) so old callers keep working.
-- Rollback: ALTER TABLE public.library_settings DROP COLUMN IF EXISTS fine_per_day;
--   (return_loan keeps the param; drop+recreate from 0011 to fully revert.)
-- ============================================================================

ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS fine_per_day NUMERIC(12, 2) NOT NULL DEFAULT 1000;

UPDATE public.library_settings
  SET fine_per_day = 1000
  WHERE fine_per_day IS NULL OR fine_per_day <= 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_fine_per_day_check'
  ) THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_fine_per_day_check CHECK (fine_per_day > 0);
  END IF;
END $$;

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
  v_rate numeric(12, 2);
  v_status text;
  v_notes text;
  v_note_suffix text;
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

  v_fine := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
    date_trunc('day', p_returned_at) - date_trunc('day', v_due_at)
  )) / 86400)) * v_rate;

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
     WHERE id = v_loan.book_id;
  ELSE
    UPDATE public.books
       SET stock_total = GREATEST(0, stock_total - 1),
           stock_available = LEAST(GREATEST(0, stock_total - 1), stock_available),
           updated_at = now()
     WHERE id = v_loan.book_id;
  END IF;

  IF v_fine > 0 THEN
    INSERT INTO public.fines (loan_id, member_id, amount, status, notes)
    VALUES (v_loan.id, v_loan.member_id, v_fine, 'unpaid',
            'Denda keterlambatan otomatis Rp' || v_rate || '/hari (due ' || v_loan.due_at || '). Kondisi: ' || p_kondisi || '.');
  END IF;

  BEGIN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (p_user_id, 'loans.return', 'loans', p_loan_id,
            jsonb_build_object('fine', v_fine, 'kondisi', p_kondisi, 'book_id', v_loan.book_id, 'fine_per_day', v_rate));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'audit log insert failed: %', SQLERRM;
  END;

  RETURN v_loan;
END;
$func$;

REVOKE ALL ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid, numeric) TO authenticated;
