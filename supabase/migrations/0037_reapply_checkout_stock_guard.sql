-- ============================================================================
-- 0037_reapply_checkout_stock_guard.sql — re-apply fix stok checkout (review #236)
--
-- KENAPA FILE BARU: 0024_checkout_reservation_tx.sql SUDAH PERNAH dijalankan
-- di setiap lingkungan yang ter-deploy. Edit pada file yang sudah terapply
-- tidak akan pernah dieksekusi ulang oleh `supabase db push`, sehingga race
-- decrement stok tetap hidup di produksi. Pola sama dipakai 0033 (re-apply
-- fix 0032 yang sudah jalan) — lihat docs/onboarding-dev.md.
-- Jadi 0037 memakai CREATE OR REPLACE (bukan edit 0024) agar DB baru DAN DB
-- lama sama-sama menerima versi perbaikan ini.
--
-- SATU-SATUNYA perubahan perilaku vs 0024 asli (satu baris + guard):
--   UPDATE public.books SET stock_available = stock_available - 1
--     WHERE id = v_res.book_id AND stock_available > 0;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Stok buku habis.' USING ERRCODE='25000';
-- Guard `stock_available <= 0` di atas (baris ~130) tetap ada sebagai
-- fail-fast; guard kondisional di UPDATE inilah yang menutup race window
-- antara SELECT ... FOR UPDATE dan UPDATE saat dua checkout bersaing.
--
-- Rollback: tidak ada downgrade otomatis — menurunkan guard berarti
-- mengembalikan race condition. Bila terpaksa, terapkan ulang definisi tanpa
-- guard dari 0024 dengan CREATE OR REPLACE yang persis sama.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.checkout_reservation_tx(
  p_reservation_id uuid,
  p_borrowed_at timestamptz DEFAULT now(),
  p_due_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_res      public.reservations;
  v_book     public.books;
  v_member   public.members;
  v_loan     public.loans;
  v_due      timestamptz;
  v_borrowed timestamptz := COALESCE(p_borrowed_at, now());
  v_max      INTEGER;
  v_active   INTEGER;
  v_overdue  INTEGER;
  v_fines    NUMERIC;
BEGIN
  -- Hanya staf (mirror requireStaff(['admin','librarian']) + is_staff()).
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Hanya pustakawan yang boleh memproses reservasi.' USING ERRCODE = '42501';
  END IF;

  -- Lock reservasi: serialisasi transisi per baris (anti dobel-klik/race).
  SELECT * INTO v_res FROM public.reservations
   WHERE id = p_reservation_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservasi tidak ditemukan.' USING ERRCODE = '02000';
  END IF;

  -- IDEMPOTENSI: sudah completed dengan loan -> kembalikan apa adanya.
  IF v_res.status = 'completed' AND v_res.loan_id IS NOT NULL THEN
    SELECT * INTO v_loan FROM public.loans WHERE id = v_res.loan_id;
    RETURN jsonb_build_object(
      'loan', to_jsonb(v_loan),
      'reservation', to_jsonb(v_res),
      'idempotent', true
    );
  END IF;

  -- State-machine ketat: hanya reservasi 'ready' boleh di-checkout.
  -- (completed tanpa loan_id ditolak: baris histori harus direkonsiliasi dulu.)
  IF v_res.status <> 'ready' THEN
    RAISE EXCEPTION 'Reservasi belum siap diambil (status %).', v_res.status
      USING ERRCODE = '25006';
  END IF;

  -- Lock buku + cek stok (atomik: decrement kondisional seperti checkout_loan).
  SELECT * INTO v_book FROM public.books WHERE id = v_res.book_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buku tidak ditemukan.' USING ERRCODE = '02000';
  END IF;
  IF v_book.stock_available <= 0 THEN
    RAISE EXCEPTION 'Stok buku habis.' USING ERRCODE = '25000';
  END IF;

  SELECT * INTO v_member FROM public.members WHERE id = v_res.member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan.' USING ERRCODE = '02000';
  END IF;
  IF v_member.status <> 'active' THEN
    RAISE EXCEPTION 'Anggota tidak aktif (suspended/expired/pending).' USING ERRCODE = '22005';
  END IF;

  -- Idempotensi (buku, anggota): satu loan aktif per pasangan (mirror 0015).
  IF EXISTS (
    SELECT 1 FROM public.loans
     WHERE book_id = v_res.book_id
       AND member_id = v_res.member_id
       AND status IN ('borrowed', 'overdue')
  ) THEN
    RAISE EXCEPTION 'Anggota sudah meminjam buku ini (loan aktif).' USING ERRCODE = '25001';
  END IF;

  -- Gate kelayakan (mirror src/lib/loan-eligibility.ts + migrasi 0023):
  -- urutan prioritas denda > keterlambatan > batas jumlah.
  SELECT COALESCE(max_active_loans, 3) INTO v_max
    FROM public.library_settings WHERE id = 1;
  v_max := GREATEST(COALESCE(v_max, 3), 1);

  SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_fines
    FROM public.fines
   WHERE member_id = v_res.member_id
     AND status IN ('unpaid', 'partial');
  IF v_fines > 0 THEN
    RAISE EXCEPTION 'Anggota memiliki tagihan denda % yang belum lunas.', v_fines
      USING ERRCODE = '25002';
  END IF;

  SELECT
    count(*) FILTER (WHERE due_at < now()),
    count(*)
    INTO v_overdue, v_active
    FROM public.loans
   WHERE member_id = v_res.member_id
     AND status IN ('borrowed', 'overdue');
  IF v_overdue > 0 THEN
    RAISE EXCEPTION 'Anggota memiliki % peminjaman terlambat.', v_overdue
      USING ERRCODE = '25003';
  END IF;
  IF v_active >= v_max THEN
    RAISE EXCEPTION 'Anggota sudah meminjam % buku (batas %).', v_active, v_max
      USING ERRCODE = '25004';
  END IF;

  -- Tempo: default +14 hari (konsisten dgn POST /api/loans; settings-based
  -- duration ditrack terpisah di issue #74).
  v_due := COALESCE(p_due_at, now() + interval '14 days');
  IF v_due <= v_borrowed THEN
    RAISE EXCEPTION 'due_at harus sesudah borrowed_at.' USING ERRCODE = '22000';
  END IF;

  -- Insert loan terlebih dahulu (butuh v_loan.id untuk reservasi).
  INSERT INTO public.loans (book_id, member_id, borrowed_at, due_at, status, fine_amount, notes)
  VALUES (v_res.book_id, v_res.member_id, v_borrowed, v_due, 'borrowed', 0, p_notes)
  RETURNING * INTO v_loan;

  UPDATE public.books
     SET stock_available = stock_available - 1
   WHERE id = v_res.book_id AND stock_available > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stok buku habis.' USING ERRCODE = '25000'; END IF;

  UPDATE public.reservations
     SET status = 'completed', loan_id = v_loan.id
   WHERE id = p_reservation_id
  RETURNING * INTO v_res;

  -- Audit atomik (best-effort insert lama pindah ke dalam transaksi).
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'loans.create', 'loans', v_loan.id::text,
          jsonb_build_object('member_id', v_res.member_id, 'book_id', v_res.book_id,
                             'reservation_id', p_reservation_id));
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'reservations.completed', 'reservations', p_reservation_id::text,
          jsonb_build_object('loan_id', v_loan.id, 'role', 'staff'));

  RETURN jsonb_build_object(
    'loan', to_jsonb(v_loan),
    'reservation', to_jsonb(v_res),
    'idempotent', false
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.checkout_reservation_tx(uuid, timestamptz, timestamptz, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.checkout_reservation_tx(uuid, timestamptz, timestamptz, text) TO authenticated;
