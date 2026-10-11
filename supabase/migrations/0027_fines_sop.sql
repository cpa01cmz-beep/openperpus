-- ============================================================================
-- 0027_fines_sop.sql — SOP denda: kwitansi bernomor + waive ber-approval + cap (#72)
-- Masalah (issue #72):
--   1. Pembayaran hanya menimpa fines.paid_amount/notes — tidak ada tabel
--      payments bernomor; bukti bayar tidak bisa dicetak/dilacak.
--   2. Status 'waived' ada di CHECK tetapi tanpa endpoint/UI/approval —
--      waive bisa dilakukan tanpa alasan dan tanpa jejak approver (fraud risk).
--   3. return_loan menghitung telat × tarif tanpa plafon — denda telat tak
--      terbatas. (Biaya ganti rugi rusak/hilang sudah ditangani 0026.)
-- Fix:
--   1. library_settings.fine_max (0 = tanpa plafon) + return_loan v4
--      mematok v_late_fine ke fine_max bila diisi.
--   2. Tabel payments IMMUTABLE (trigger blokir UPDATE/DELETE) + receipt_no
--      UNIQUE dari sequence; pay_fine_tx menulisnya atomik bersama pembayaran.
--   3. Tabel fine_waivers + RPC request/decide: alasan wajib (>= 10 karakter),
--      keputusan hanya admin, approver WAJIB berbeda dari pengaju (CHECK DB).
-- Sifat: aditif + idempotent (ADD COLUMN IF EXISTS, CREATE OR REPLACE,
--   CREATE TABLE IF NOT EXISTS). return_loan TIDAK berubah signature.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.decide_fine_waiver(uuid, boolean, text, uuid);
--   DROP FUNCTION IF EXISTS public.request_fine_waiver(uuid, text, uuid);
--   DROP FUNCTION IF EXISTS public.pay_fine_tx(uuid, numeric, text, uuid);
--   DROP FUNCTION IF EXISTS public.next_receipt_no();
--   DROP TRIGGER IF EXISTS trg_payments_immutable ON public.payments;
--   DROP FUNCTION IF EXISTS public.payments_immutable();
--   DROP TABLE IF EXISTS public.fine_waivers;
--   DROP TABLE IF EXISTS public.payments;
--   DROP SEQUENCE IF EXISTS public.payment_receipt_seq;
--   DROP FUNCTION IF EXISTS public.return_loan(uuid, timestamptz, text, text, uuid, numeric);
--   jalankan ulang 0014_fine_rate.sql; lalu
--   ALTER TABLE public.library_settings DROP COLUMN IF EXISTS fine_max;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. library_settings.fine_max — plafon denda keterlambatan (0 = tanpa plafon).
--    Nama kolom kanonis Inggris (lihat issue #71); label Indonesia hanya di UI.
-- ----------------------------------------------------------------------------
ALTER TABLE public.library_settings
  ADD COLUMN IF NOT EXISTS fine_max NUMERIC(12, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_settings_fine_max_check') THEN
    ALTER TABLE public.library_settings
      ADD CONSTRAINT library_settings_fine_max_check CHECK (fine_max >= 0);
  END IF;
END $$;

UPDATE public.library_settings
   SET fine_max = 0
 WHERE fine_max IS NULL OR fine_max < 0;

COMMENT ON COLUMN public.library_settings.fine_max IS
  'Plafon denda keterlambatan (Rp). 0 = tanpa plafon (perilaku sebelum #72).';

-- ----------------------------------------------------------------------------
-- 2. return_loan v4 — denda telat dipatok fine_max (bila > 0).
--    Signature TIDAK berubah; biaya ganti rugi (0026) tetap ditambahkan.
--    Catatan penanda plafon ditulis ke notes loan + notes fines + audit.
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
  v_fine_max numeric(12, 2);
  v_capped boolean := false;
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

  -- Plafon denda telat (#72): fine_max > 0 -> Jepit v_late_fine ke fine_max.
  -- Biaya ganti rugi rusak/hilang (0026) TIDAK ikut dipatok — itu biaya barang.
  v_fine_max := GREATEST(0, COALESCE(
    (SELECT s.fine_max FROM public.library_settings s WHERE s.id = 1), 0));
  IF v_fine_max > 0 AND v_late_fine > v_fine_max THEN
    v_late_fine := v_fine_max;
    v_capped := true;
  END IF;

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
    || CASE WHEN v_capped
      THEN ' Denda dipatok maksimum Rp' || v_fine_max || ' (setelan plafon denda).'
      ELSE '' END
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
              'capped', v_capped,
              'fine_max', v_fine_max,
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

-- ----------------------------------------------------------------------------
-- 3. payments — kwitansi pembayaran denda, IMMUTABLE + receipt_no UNIQUE.
--    Baris dibuat hanya lewat RPC pay_fine_tx (SECURITY DEFINER) atau fallback
--    API (policy insert owner/staff); UPDATE/DELETE diblokir trigger untuk
--    SEMUA peran (termasuk owner/service_role) -> bukti bayar tak bisa dihapus.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id      UUID NOT NULL REFERENCES public.fines (id) ON DELETE CASCADE,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL DEFAULT 'cash',
  receipt_no   TEXT NOT NULL,
  received_by  UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_no ON public.payments (receipt_no);
CREATE INDEX IF NOT EXISTS idx_payments_fine_id ON public.payments (fine_id);

CREATE SEQUENCE IF NOT EXISTS public.payment_receipt_seq START 1;

CREATE OR REPLACE FUNCTION public.next_receipt_no()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'RCP-' || to_char(now(), 'YYYYMMDD') || '-' ||
         lpad(nextval('public.payment_receipt_seq')::text, 6, '0');
$$;

-- Immutability: blokir UPDATE & DELETE bukti bayar (audit trail keuangan).
CREATE OR REPLACE FUNCTION public.payments_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  RAISE EXCEPTION 'payments bersifat immutable — bukti bayar tidak boleh diubah/dihapus.'
    USING ERRCODE = '42501';
END;
$func$;

DROP TRIGGER IF EXISTS trg_payments_immutable ON public.payments;
CREATE TRIGGER trg_payments_immutable
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_immutable();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments read staff" ON public.payments;
CREATE POLICY "payments read staff"
  ON public.payments FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "payments read own" ON public.payments;
CREATE POLICY "payments read own"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fines f
      JOIN public.members m ON m.id = f.member_id
      WHERE f.id = payments.fine_id AND m.user_id = auth.uid()
    )
  );

-- Insert hanya pemilik denda atau staf; UPDATE/DELETE TIDAK ada policy
-- (dan ditambah trigger immutable) -> kwitansi tidak bisa dimanipulasi klien.
DROP POLICY IF EXISTS "payments insert owner or staff" ON public.payments;
CREATE POLICY "payments insert owner or staff"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.fines f
      JOIN public.members m ON m.id = f.member_id
      WHERE f.id = payments.fine_id AND m.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.payment_receipt_seq TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. pay_fine_tx — pembayaran denda + kwitansi payments dalam SATU transaksi.
--    Logika identik pay_own_fine (0013) + INSERT payments (receipt_no dari
--    sequence) + audit memuat receipt_no.
--    Returns jsonb: { "fine": <fines row>, "payment": <payments row> }.
--    SQLSTATE: 42501 forbidden, 02000 not found, 25001 conflict/already paid,
--              22000 invalid amount.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_fine_tx(
  p_fine_id uuid,
  p_amount numeric DEFAULT NULL,
  p_method text DEFAULT 'cash',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_fine public.fines;
  v_payment public.payments;
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
  v_remain numeric(12, 2);
  v_pay numeric(12, 2);
  v_new_paid numeric(12, 2);
  v_is_full boolean;
  v_method text;
  v_receipt text;
BEGIN
  -- Otorisasi: staff ATAU pemilik baris member (fines.member_id -> members.user_id).
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

  -- Kwitansi bernomor: sequence + UNIQUE index -> tidak ada dua kwitansi sama.
  v_receipt := public.next_receipt_no();
  INSERT INTO public.payments (fine_id, amount, method, receipt_no, received_by)
  VALUES (p_fine_id, v_pay, v_method, v_receipt, p_user_id)
  RETURNING * INTO v_payment;

  -- Audit WAJIB (bukan best-effort): jejak bayar adalah bukti keuangan.
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (p_user_id, 'fines.pay', 'fines', p_fine_id,
          jsonb_build_object('loan_id', v_fine.loan_id, 'member_id', v_fine.member_id,
                             'amount', v_pay, 'method', v_method, 'status', v_fine.status,
                             'receipt_no', v_receipt, 'payment_id', v_payment.id));

  RETURN jsonb_build_object('fine', to_jsonb(v_fine), 'payment', to_jsonb(v_payment));
END;
$func$;

REVOKE ALL ON FUNCTION public.pay_fine_tx(uuid, numeric, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pay_fine_tx(uuid, numeric, text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. fine_waivers — pembebasan denda (waive) dua langkah: pengajuan + approval.
--    reason WAJIB (CHECK >= 10 karakter); approved_by WAJIB beda dari
--    requested_by (CHECK DB) — pengaju tidak bisa menyetujui dirinya sendiri
--    walau lewat policy/kebocoran aplikasi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fine_waivers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id       UUID NOT NULL REFERENCES public.fines (id) ON DELETE CASCADE,
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) >= 10),
  status        TEXT NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested', 'approved', 'rejected')),
  requested_by  UUID NOT NULL REFERENCES public.profiles (id),
  approved_by   UUID REFERENCES public.profiles (id),
  decision_note TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at    TIMESTAMPTZ,
  CONSTRAINT fine_waivers_approver_diff
    CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE INDEX IF NOT EXISTS idx_fine_waivers_fine_id ON public.fine_waivers (fine_id);
CREATE INDEX IF NOT EXISTS idx_fine_waivers_status ON public.fine_waivers (status);

COMMENT ON TABLE public.fine_waivers IS
  'Pengajuan pembebasan denda: alasan wajib, keputusan admin, approver <> pengaju (issue #72).';

ALTER TABLE public.fine_waivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read fine_waivers" ON public.fine_waivers;
CREATE POLICY "staff read fine_waivers"
  ON public.fine_waivers FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "staff insert fine_waivers" ON public.fine_waivers;
CREATE POLICY "staff insert fine_waivers"
  ON public.fine_waivers FOR INSERT TO authenticated WITH CHECK (public.is_staff());

-- Hanya admin yang boleh mengubah status lewat klien (CHECK approver_diff tetap
-- mengunci self-approval); jalur normal tetap lewat RPC decide_fine_waiver.
DROP POLICY IF EXISTS "admin update fine_waivers" ON public.fine_waivers;
CREATE POLICY "admin update fine_waivers"
  ON public.fine_waivers FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.fine_waivers TO authenticated;

-- 5a. request_fine_waiver — staf mengajukan pembebasan (alasan wajib).
CREATE OR REPLACE FUNCTION public.request_fine_waiver(
  p_fine_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL
)
RETURNS public.fine_waivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_fine public.fines;
  v_waiver public.fine_waivers;
  v_existing uuid;
  v_reason text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Butuh peran admin/librarian.' USING ERRCODE = '42501';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Alasan pembebasan wajib diisi minimal 10 karakter.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_fine FROM public.fines WHERE id = p_fine_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denda tidak ditemukan.' USING ERRCODE = '02000';
  END IF;
  IF v_fine.status NOT IN ('unpaid', 'partial') THEN
    RAISE EXCEPTION 'Denda sudah lunas/dibebaskan.' USING ERRCODE = '25001';
  END IF;

  SELECT id INTO v_existing
    FROM public.fine_waivers
   WHERE fine_id = p_fine_id AND status = 'requested'
   LIMIT 1
     FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Sudah ada pengajuan pembebasan yang menunggu approval.' USING ERRCODE = '25001';
  END IF;

  INSERT INTO public.fine_waivers (fine_id, reason, requested_by)
  VALUES (p_fine_id, v_reason, auth.uid())
  RETURNING * INTO v_waiver;

  -- Audit wajib: pengajuan waive adalah langkah rentan fraud.
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (COALESCE(p_user_id, auth.uid()), 'fines.waive_request', 'fines', p_fine_id,
          jsonb_build_object('waiver_id', v_waiver.id, 'reason', v_reason,
                             'requested_by', auth.uid()));

  RETURN v_waiver;
END;
$func$;

REVOKE ALL ON FUNCTION public.request_fine_waiver(uuid, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_fine_waiver(uuid, text, uuid) TO authenticated;

-- 5b. decide_fine_waiver — admin MENYETUJUI/MENOLAK; approver <> pengaju.
CREATE OR REPLACE FUNCTION public.decide_fine_waiver(
  p_waiver_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS public.fine_waivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_waiver public.fine_waivers;
  v_note text;
BEGIN
  -- Segregation of duties: hanya admin yang memutuskan.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Approval pembebasan hanya admin.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_waiver FROM public.fine_waivers WHERE id = p_waiver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan pembebasan tidak ditemukan.' USING ERRCODE = '02000';
  END IF;
  IF v_waiver.status <> 'requested' THEN
    RAISE EXCEPTION 'Pengajuan pembebasan sudah diputuskan.' USING ERRCODE = '25001';
  END IF;
  -- Pengaju tidak boleh menjadi approver-nya sendiri.
  IF v_waiver.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Pembebasan tidak boleh disetujui pengajunya sendiri — minta admin lain.'
      USING ERRCODE = '42501';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  IF p_approve THEN
    -- Lock denda lalu ubah status -> waived hanya bila masih unpaid|partial.
    UPDATE public.fines
       SET status = 'waived',
           notes = left(COALESCE(notes, '') || ' | Dibebaskan (waive): ' || v_waiver.reason, 2000),
           updated_at = now()
     WHERE id = v_waiver.fine_id
       AND status IN ('unpaid', 'partial');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Denda sudah berubah status, muat ulang dulu.' USING ERRCODE = '25001';
    END IF;
  END IF;

  UPDATE public.fine_waivers
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         approved_by = auth.uid(),
         decision_note = v_note,
         decided_at = now()
   WHERE id = p_waiver_id
  RETURNING * INTO v_waiver;

  -- Audit wajib: jejak lengkap (siapa mengajukan, siapa menyetujui, alasan).
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (COALESCE(p_user_id, auth.uid()),
          CASE WHEN p_approve THEN 'fines.waive_approve' ELSE 'fines.waive_reject' END,
          'fines', v_waiver.fine_id,
          jsonb_build_object('waiver_id', v_waiver.id, 'reason', v_waiver.reason,
                             'requested_by', v_waiver.requested_by,
                             'approved_by', auth.uid(),
                             'decision_note', v_note,
                             'approved', p_approve));

  RETURN v_waiver;
END;
$func$;

REVOKE ALL ON FUNCTION public.decide_fine_waiver(uuid, boolean, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_fine_waiver(uuid, boolean, text, uuid) TO authenticated;
