-- ============================================================================
-- 0005_checkout.sql — atomic loan checkout (T-S4)
-- checkout_loan(p_book_id, p_member_id, ...) locks the book row
-- (SELECT ... FOR UPDATE), raises when stock<=0, decrements atomically,
-- then inserts the loan row. Single transaction => no read-then-write race.
-- Rollback: DROP FUNCTION IF EXISTS public.checkout_loan(uuid, uuid, timestamptz, timestamptz, text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.checkout_loan(
  p_book_id uuid,
  p_member_id uuid,
  p_borrowed_at timestamptz DEFAULT now(),
  p_due_at timestamptz DEFAULT (now() + interval '14 days'),
  p_notes text DEFAULT NULL
)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_loan public.loans;
BEGIN
  -- S-sec-rls: caller must be staff OR the owner of the member row.
  IF NOT public.is_staff() AND NOT EXISTS (
    SELECT 1 FROM public.members m
     WHERE m.id = p_member_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tidak berhak meminjam untuk anggota ini.' USING ERRCODE = '42501';
  END IF;

  IF p_due_at <= p_borrowed_at THEN
    RAISE EXCEPTION 'due_at harus sesudah borrowed_at.' USING ERRCODE = '22000';
  END IF;

  PERFORM 1 FROM public.books WHERE id = p_book_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buku tidak ditemukan.' USING ERRCODE = '02000';
  END IF;

  UPDATE public.books
     SET stock_available = stock_available - 1
   WHERE id = p_book_id
     AND stock_available > 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stok buku habis.' USING ERRCODE = '25000';
  END IF;

  INSERT INTO public.loans (book_id, member_id, borrowed_at, due_at, status, fine_amount, notes)
  VALUES (p_book_id, p_member_id, p_borrowed_at, p_due_at, 'borrowed', 0, p_notes)
  RETURNING * INTO v_loan;

  RETURN v_loan;
END;
$func$;

REVOKE ALL ON FUNCTION public.checkout_loan(uuid, uuid, timestamptz, timestamptz, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.checkout_loan(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
