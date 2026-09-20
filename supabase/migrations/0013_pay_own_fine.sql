-- ============================================================================
-- 0013_pay_own_fine.sql — owner self-pay RPC (Security + US-03/S-roi)
-- pay_own_fine(p_fine_id, p_amount, p_method, p_user_id)
-- SECURITY DEFINER: pemilik denda boleh membayar MILIK SENDIRI tanpa melemahkan
-- RLS UPDATE fines (yang tetap staff-only di 0002_rls.sql:348-351).
-- Caller harus staff ATAU owner (fines.member_id -> members.user_id = auth.uid()).
-- Single transaction: row lock + guard 409 + validasi nominal + update
--   paid_amount/status/paid_at/notes + audit best-effort.
-- Returns fine row atau raise SQLSTATE: 02000 (not found), 25001 (conflict/
-- already paid), 22000 (invalid amount), 42501 (forbidden).
-- Rollback: DROP FUNCTION IF EXISTS public.pay_own_fine(uuid, numeric, text, uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_own_fine(
  p_fine_id uuid,
  p_amount numeric DEFAULT NULL,
  p_method text DEFAULT 'cash',
  p_user_id uuid DEFAULT NULL
)
RETURNS public.fines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_fine public.fines;
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
  v_remain numeric(12, 2);
  v_pay numeric(12, 2);
  v_new_paid numeric(12, 2);
  v_is_full boolean;
  v_method text;
BEGIN
  -- Otorisasi: staff ATAU pemilik baris member (via fines.member_id -> members.user_id).
  IF NOT public.is_staff() AND NOT EXISTS (
    SELECT 1 FROM public.fines f
    JOIN public.members m ON m.id = f.member_id
    WHERE f.id = p_fine_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Denda tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  -- Lock baris untuk cegah double-submit konkuren.
  SELECT * INTO v_fine FROM public.fines WHERE id = p_fine_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denda tidak ditemukan.' USING ERRCODE = '02000';
  END IF;

  -- Guard: sudah lunas/dibebaskan (kontrak 409).
  IF v_fine.status = 'paid' OR v_fine.status = 'waived' THEN
    RAISE EXCEPTION 'Denda sudah lunas/dibebaskan.' USING ERRCODE = '25001';
  END IF;

  v_total := v_fine.amount;
  v_paid := COALESCE(v_fine.paid_amount, 0);
  v_remain := v_total - v_paid;
  IF v_remain <= 0 THEN
    RAISE EXCEPTION 'Denda sudah lunas.' USING ERRCODE = '25001';
  END IF;

  -- Nominal: NULL => lunasi sisa; selain itu harus angka > 0 dan <= sisa.
  IF p_amount IS NULL THEN
    v_pay := v_remain;
  ELSE
    v_pay := p_amount;
  END IF;
  IF v_pay IS NULL OR v_pay <= 0 THEN
    RAISE EXCEPTION 'amount/nominal harus angka > 0.' USING ERRCODE = '22000';
  END IF;
  IF round(v_pay * 100) > round(v_remain * 100) THEN
    RAISE EXCEPTION 'Nominal melebihi sisa denda (%).', v_remain USING ERRCODE = '22000';
  END IF;

  v_new_paid := v_paid + v_pay;
  v_is_full := round(v_new_paid * 100) >= round(v_total * 100);
  v_method := NULLIF(btrim(COALESCE(p_method, 'cash')), '');
  IF v_method IS NULL THEN
    v_method := 'cash';
  END IF;

  -- Compare-and-set: hanya unpaid|partial yang bisa diupdate (idempoten 409).
  UPDATE public.fines
     SET paid_amount = v_new_paid,
         status = CASE WHEN v_is_full THEN 'paid' ELSE 'partial' END,
         paid_at = CASE WHEN v_is_full THEN now() ELSE NULL END,
         notes = 'Dibayar via ' || v_method || '.',
         updated_at = now()
   WHERE id = p_fine_id
     AND status IN ('unpaid', 'partial')
  RETURNING * INTO v_fine;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denda sudah berubah status, muat ulang dulu.' USING ERRCODE = '25001';
  END IF;

  -- Audit log (best-effort: tidak pernah rollback transaksi utama).
  BEGIN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (p_user_id, 'fines.pay', 'fines', p_fine_id,
            jsonb_build_object('loan_id', v_fine.loan_id, 'member_id', v_fine.member_id,
                               'amount', v_pay, 'method', v_method, 'status', v_fine.status));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'audit log insert failed: %', SQLERRM;
  END;

  RETURN v_fine;
END;
$func$;

REVOKE ALL ON FUNCTION public.pay_own_fine(uuid, numeric, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pay_own_fine(uuid, numeric, text, uuid) TO authenticated;
