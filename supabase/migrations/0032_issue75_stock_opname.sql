-- ============================================================================
-- 0032_issue75_stock_opname.sql — opname ATOMIK via RPC (issue #75)
-- Masalah: PUT /api/books stock_opname lama = cek loan aktif lalu upsert
--   per-baris dari aplikasi (tanpa row lock/transaksi) — loan yang masuk
--   di antara cek dan upsert bisa tertimpa (available naik tanpa kurangi
--   pinjaman berjalan), update separuh tanpa rollback.
-- Fix: SATU transaksi DB — lock buku FOR UPDATE per baris, hitung pinjaman
--   aktif FRESH di dalam transaksi, clamp available <= total - active,
--   update + audit books.stock_opname (berita acara selisih: diffs
--   old_available/new_available) atomik. Gagal di titik mana pun = rollback.
--   SQLSTATE: 42501 bukan staf | 22000 items tidak valid.
--   Baris per-buku invalid/dipinjam TIDAK menggagalkan batch -> skipped
--   (alasan per baris, sama dengan kontrak API lama).
-- Sifat: aditif + idempotent (CREATE OR REPLACE).
-- ponytail: approval opname dua langkah belum ada — tambah tabel
--   stock_opname_batches + RPC ajukan/setujui bila opname jadi SOP sensitif.
-- Rollback: DROP FUNCTION IF EXISTS public.stock_opname_tx(jsonb, uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stock_opname_tx(
  p_items jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count    INTEGER;
  v_idx      INTEGER;
  v_item     jsonb;
  v_id_text  TEXT;
  v_id       uuid;
  v_st_text  TEXT;
  v_sa_text  TEXT;
  v_st       INTEGER;
  v_sa       INTEGER;
  v_old      INTEGER;
  v_active   INTEGER;
  v_clamped  INTEGER;
  v_seen     uuid[] := '{}';
  v_updated  uuid[] := '{}';
  v_skipped  jsonb := '[]'::jsonb;
  v_diffs    jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Hanya pustakawan yang boleh melakukan stok opname.' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Body harus { action: stock_opname, items: [...] }.' USING ERRCODE = '22000';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'items tidak boleh kosong.' USING ERRCODE = '22000';
  END IF;
  IF v_count > 100 THEN
    RAISE EXCEPTION 'Maksimal 100 item per stock_opname.' USING ERRCODE = '22000';
  END IF;

  FOR v_idx IN 0 .. v_count - 1 LOOP
    v_item := p_items -> v_idx;
    v_id_text := NULLIF(btrim(COALESCE(v_item ->> 'id', '')), '');
    BEGIN
      v_id := v_id_text::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_id := NULL;
    END;
    IF v_id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('id', COALESCE(v_id_text, '(tanpa id)'), 'reason', 'id wajib UUID valid.');
      CONTINUE;
    END IF;
    IF v_id = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := v_seen || v_id;

    v_st_text := v_item ->> 'stock_total';
    v_sa_text := v_item ->> 'stock_available';
    BEGIN
      IF v_st_text IS NULL OR v_sa_text IS NULL
         OR v_st_text !~ '^\d+$' OR v_sa_text !~ '^\d+$' THEN
        RAISE EXCEPTION 'invalid';
      END IF;
      v_st := v_st_text::INTEGER;
      v_sa := v_sa_text::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Stok tidak valid: harus bilangan bulat >= 0.');
      CONTINUE;
    END;
    IF v_sa > v_st THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Stok tersedia melebihi stok total.');
      CONTINUE;
    END IF;

    -- Lock baris buku: serialisasi opname konkuren + checkout per buku.
    SELECT b.stock_available INTO v_old FROM public.books b WHERE b.id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Buku tidak ditemukan.');
      CONTINUE;
    END IF;

    -- Hitung FRESH di dalam transaksi (setelah lock) — tanpa jendela TOCTOU.
    SELECT count(*)::INTEGER INTO v_active FROM public.loans
     WHERE book_id = v_id AND status IN ('borrowed', 'overdue');
    IF v_active > 0 THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Dilewati: buku masih dipinjam.');
      CONTINUE;
    END IF;

    v_clamped := LEAST(v_sa, GREATEST(0, v_st - v_active));
    UPDATE public.books
       SET stock_total = v_st, stock_available = v_clamped, updated_at = now()
     WHERE id = v_id;

    v_updated := v_updated || v_id;
    v_diffs := v_diffs || jsonb_build_object('id', v_id, 'old_available', v_old, 'new_available', v_clamped);
  END LOOP;

  IF v_seen = '{}' THEN
    RAISE EXCEPTION 'Setiap item wajib punya id UUID.' USING ERRCODE = '22000';
  END IF;

  -- Berita acara selisih: 1 audit row berisi full diff (atomik dalam transaksi).
  IF v_updated <> '{}' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(p_user_id, auth.uid()), 'books.stock_opname', 'books', v_updated[1]::text,
            jsonb_build_object('ids', to_jsonb(v_updated), 'diffs', v_diffs, 'bulk', array_length(v_updated, 1) > 1));
  END IF;

  RETURN jsonb_build_object('updated', to_jsonb(v_updated), 'skipped', v_skipped, 'diffs', v_diffs);
END;
$func$;

REVOKE ALL ON FUNCTION public.stock_opname_tx(jsonb, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.stock_opname_tx(jsonb, uuid) TO authenticated;
