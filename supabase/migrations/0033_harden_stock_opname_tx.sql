-- ============================================================================
-- 0033_harden_stock_opname_tx.sql — hardening stock_opname_tx (review #117)
-- Review Kilo pada PR #117 menemukan cacat pada 0032 yang sudah terapply.
-- Fix di sini (CREATE OR REPLACE — file BARU, bukan edit 0032, agar lingkungan
-- yang sudah menjalankan 0032 ikut menerima versi ini):
--   1. DEADLOCK: 0032 mengambil lock per baris pada urutan input klien
--      ([A,B] vs [B,A] bisa saling tunggu -> SQLSTATE 40P01 -> 500).
--      Sekarang SEMUA kandidat di-lock SEKALIGUS `ORDER BY id FOR UPDATE`.
--   2. DOBEL-PROSES: 0032 memasang cek duplikat SEBELUM validasi stok, jadi
--      [{A,'x'},{A,5,0}] tidak mengupdate apa pun, sementara jalur aplikasi
--      tetap memproses item kedua. Kontrak "perilaku identik" dipertahankan:
--      id duplikat hanya di-dedupe bila baris itu BERHASIL diproses.
--   3. ERROR TERSEMBUNYI: `EXCEPTION WHEN OTHERS` pada blok parsing stok
--      mengubah error internal (timeout/cancel) menjadi baris "skipped"
--      -> request 200. Ganti dengan predikat eksplisit, tanpa exception.
--   4. MASKING UUID: EXCEPTION disempitkan ke invalid_text_representation (22P02).
--   5. RENTANG int4: nilai > 2147483647 melempar 22003 saat cast dan
--      membatalkan SELURUH batch (baris sah ikut gagal -> 500 global).
--      Predikat digit diperketat menjadi `^\d{1,10}$` (batas panjang int4 =
--      10 digit): string digit super-panjang tak pernah mencapai cast —
--      ::NUMERIC pun tak mungkin melempar 22003 pada masukan <= 10 digit.
--   6. KONTRAK: docstring 0032 mengiklankan "clamp available <= total - active",
--      padahal buku berpinjaman di-CONTINUE sehingga v_active SELALU 0 saat
--      clamp -> ekspresi itu dead code dan menyesatkan (terlihat seperti safety
--      net). Docstring diperbaiki, ekspresi dead dibuang.
--   7. PERILAKU IDENTIK dengan fallback aplikasi: urutan cek kini
--      id -> existence -> dipinjam -> stok (mengikuti fallback), sehingga
--      reason string "skipped" sama di kedua jalur; predikat stok juga
--      menyamai fallback (parseOpnameStock di src/app/api/books/route.ts):
--      bilangan bulat >= 0, maks 10 digit, rentang int4.
-- Rollback: eksekusi ulang isi supabase/migrations/0032_issue75_stock_opname.sql
--   (CREATE OR REPLACE memulihkan definisi sebelumnya), atau darurat:
--   DROP FUNCTION IF EXISTS public.stock_opname_tx(jsonb, uuid); — PUT
--   /api/books otomatis jatuh ke fallback aplikasi (jalan non-atomik).
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
  -- SEMUA id UDP valid dari input (unik).
  v_ids      uuid[] := '{}';
  -- snapshot stock_available buku yang sudah di-lock: { "<uuid>": old_available }
  v_locked   jsonb := '{}'::jsonb;
  v_lock     RECORD;
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

  -- ---------------------------------------------------------------------------
  -- Pass 1: kumpulkan id UDP valid (belum menyentuh row).
  -- ---------------------------------------------------------------------------
  FOR v_idx IN 0 .. v_count - 1 LOOP
    v_id_text := NULLIF(btrim(COALESCE((p_items -> v_idx) ->> 'id', '')), '');
    BEGIN
      v_id := v_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_id := NULL; -- 22P02: bukan UUID — dicatat sebagai skipped di bawah.
    END;
    IF v_id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('id', COALESCE(v_id_text, '(tanpa id)'), 'reason', 'id wajib UUID valid.');
    ELSE
      -- Kandidat lock cukup sekali per buku.
      IF v_id <> ALL (v_ids) THEN
        v_ids := v_ids || v_id;
      END IF;
    END IF;
  END LOOP;

  IF v_ids = '{}' THEN
    RAISE EXCEPTION 'Setiap item wajib punya id UUID.' USING ERRCODE = '22000';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Pass 2: LOCK semua kandidat SEKALIGUS dalam urutan id.
  -- Urutan deterministik menghilangkan deadlock lintas batch yang overlap
  -- ([A,B] vs [B,A]): tak ada lagi lock yang saling menunggu.
  -- ---------------------------------------------------------------------------
  FOR v_lock IN
    SELECT b.id AS id, b.stock_available AS stock_available
      FROM public.books b
     WHERE b.id = ANY (v_ids)
     ORDER BY b.id
     FOR UPDATE
  LOOP
    v_locked := v_locked || jsonb_build_object(v_lock.id::text, v_lock.stock_available);
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Pass 3: validasi + update per item (mengikuti urutan input).
  -- URUTAN cek identik dengan fallback aplikasi (src/app/api/books/route.ts):
  -- id -> (dedup) -> existence -> dipinjam -> stok. Reason string "skipped"
  -- karena itu sama di kedua jalur.
  -- ---------------------------------------------------------------------------
  FOR v_idx IN 0 .. v_count - 1 LOOP
    v_item := p_items -> v_idx;
    v_id_text := NULLIF(btrim(COALESCE(v_item ->> 'id', '')), '');
    BEGIN
      v_id := v_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_id := NULL;
    END;
    -- id non-UDP sudah dicatat sebagai skipped di pass 1.
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;
    -- Dedup hanya untuk baris yang BERHASIL diproses — sama seperti jalur
    -- aplikasi (baris invalid tetap menghasilkan skipped per item).
    IF v_id = ANY (v_updated) THEN
      CONTINUE;
    END IF;

    -- Tidak ter-lock di pass 2 = baris buku tidak ada.
    IF NOT (v_locked ? v_id::text) THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Buku tidak ditemukan.');
      CONTINUE;
    END IF;

    -- Hitung FRESH di dalam transaksi (setelah lock) — tanpa jendela TOCTOU.
    -- Aturan: buku dengan pinjaman borrowed/overdue DILEWATI (dengan alasan),
    -- jadi available akhir selalu = nilai opname. Tidak ada clamp tersembunyi.
    SELECT count(*)::INTEGER INTO v_active FROM public.loans
     WHERE book_id = v_id AND status IN ('borrowed', 'overdue');
    IF v_active > 0 THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Dilewati: buku masih dipinjam.');
      CONTINUE;
    END IF;

    v_st_text := v_item ->> 'stock_total';
    v_sa_text := v_item ->> 'stock_available';
    -- Predikat eksplisit (bukan EXCEPTION WHEN OTHERS): timeout/cancel/error
    -- internal tetap melempar dan menggagalkan transaksi, bukan menyamar jadi
    -- baris "skipped" dengan HTTP 200.
    -- Batas panjang 10 digit DULU (maks 2147483647 = 10 digit): string digit
    -- lebih panjang tak boleh sampai ke cast — ::NUMERIC/::INTEGER melempar
    -- 22003 dan membatalkan SELURUH batch.
    IF v_st_text IS NULL OR v_sa_text IS NULL
       OR v_st_text !~ '^\d{1,10}$' OR v_sa_text !~ '^\d{1,10}$' THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Stok tidak valid: harus bilangan bulat >= 0.');
      CONTINUE;
    END IF;
    -- Masukan sudah <= 10 digit, jadi cast aman; saring rentang int4.
    IF v_st_text::NUMERIC > 2147483647 OR v_sa_text::NUMERIC > 2147483647 THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Stok tidak valid: harus bilangan bulat >= 0.');
      CONTINUE;
    END IF;
    v_st := v_st_text::INTEGER;
    v_sa := v_sa_text::INTEGER;
    IF v_sa > v_st THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Stok tersedia melebihi stok total.');
      CONTINUE;
    END IF;

    UPDATE public.books
       SET stock_total = v_st, stock_available = v_sa, updated_at = now()
     WHERE id = v_id;

    v_old := (v_locked ->> v_id::text)::INTEGER;
    v_updated := v_updated || v_id;
    v_diffs := v_diffs || jsonb_build_object('id', v_id, 'old_available', v_old, 'new_available', v_sa);
  END LOOP;

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
