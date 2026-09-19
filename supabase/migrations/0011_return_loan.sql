-- ============================================================================
-- 0011_return_loan.sql — atomic loan return (Keandalan & Pengujian)
-- return_loan(p_loan_id, p_returned_at, p_kondisi, p_notes, p_user_id)
-- Single transaction: row lock + guard 409 + loan update + stock clamp
--   + fines insert + audit insert. No sequential partial-failure window.
-- Returns loan row or raises with SQLSTATE: 02000 (not found), 25001 (already returned),
-- 22000 (invalid kondisi), 42501 (forbidden).
-- Rollback: DROP FUNCTION IF EXISTS public.return_loan(uuid, timestamptz, text, text, uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.return_loan(
  p_loan_id uuid,
  p_returned_at timestamptz DEFAULT now(),
  p_kondisi text DEFAULT 'baik',
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
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
  v_status text;
  v_notes text;
  v_note_suffix text;
BEGIN
  -- S-sec-rls: caller must be staff OR the owner of the member row (via loans.member_id -> members.user_id).
  IF NOT public.is_staff() AND NOT EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.members m ON m.id = l.member_id
    WHERE l.id = p_loan_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tidak berhak mengembalikan peminjaman ini.' USING ERRCODE = '42501';
  END IF;

  -- Lock the loan row to prevent concurrent double returns.
  SELECT l.* INTO v_loan FROM public.loans l WHERE l.id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjaman tidak ditemukan.' USING ERRCODE = '02000';
  END IF;

  -- Guard: already returned / lost (409 contract).
  IF v_loan.status = 'returned' OR v_loan.status = 'lost' THEN
    RAISE EXCEPTION 'Sudah dikembalikan.' USING ERRCODE = '25001';
  END IF;

  -- Validate kondisi.
  IF p_kondisi NOT IN ('baik', 'rusak', 'hilang') THEN
    RAISE EXCEPTION 'kondisi harus: baik|rusak|hilang.' USING ERRCODE = '22000';
  END IF;

  v_book_id := v_loan.book_id;
  v_member_id := v_loan.member_id;
  v_due_at := v_loan.due_at;

  -- Denda Rp1000/hari telat: midnight-normalized floor(diff/86400) * 1000, never negative.
  v_fine := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
    date_trunc('day', p_returned_at) - date_trunc('day', v_due_at)
  )) / 86400)) * 1000;

  -- New status + notes.
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

  -- Update loan (returned_at, status, fine_amount, notes).
  UPDATE public.loans
     SET returned_at = p_returned_at,
         status = v_status,
         fine_amount = v_fine,
         notes = v_notes,
         updated_at = now()
   WHERE id = p_loan_id
   RETURNING * INTO v_loan;

  -- Stock clamp:
  --   baik   -> stock_available = LEAST(stock_total, stock_available + 1)
  --   rusak  -> stock_total = GREATEST(0, stock_total - 1), stock_available = LEAST(stock_total, stock_available)
  --   hilang -> stock_total = GREATEST(0, stock_total - 1), stock_available = LEAST(stock_total, stock_available)
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

  -- Insert fine row if fine > 0.
  IF v_fine > 0 THEN
    INSERT INTO public.fines (loan_id, member_id, amount, status, notes)
    VALUES (v_loan.id, v_loan.member_id, v_fine, 'unpaid',
            'Denda keterlambatan otomatis Rp1000/hari (due ' || v_loan.due_at || '). Kondisi: ' || p_kondisi || '.');
  END IF;

  -- Audit log (best-effort: never roll back the main transaction).
  BEGIN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (p_user_id, 'loans.return', 'loans', p_loan_id,
            jsonb_build_object('fine', v_fine, 'kondisi', p_kondisi, 'book_id', v_loan.book_id));
  EXCEPTION WHEN OTHERS THEN
    -- Log audit failure but don't fail the return.
    RAISE NOTICE 'audit log insert failed: %', SQLERRM;
  END;

  RETURN v_loan;
END;
$func$;

REVOKE ALL ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.return_loan(uuid, timestamptz, text, text, uuid) TO authenticated;