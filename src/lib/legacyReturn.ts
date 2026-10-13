import { NextResponse } from 'next/server';
import { calcFine, jsonError, FINE_PER_DAY } from '@/lib/supabase/auth';
import { capLateFine, getFineMax, getReplacementFee } from '@/lib/loan-settings';
import { ACTIVE_LOAN_STATUSES } from '@/lib/loans-overdue';
import { isZeroRows } from '@/lib/zero-rows';
import { formatRp } from '@/lib/format';
import { createLogger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

/**
 * KOSAKATA status hasil penulisan MAJU return — SATU-SATUNYA sumber, dipakai
 * BERSAMA oleh penulisan maju (`status: 'returned' | 'lost'`) dan guard
 * kompensasi `tryRevertLoanReturn` (`.in('status', …)`).
 *
 * Sebelumnya keduanya menuliskan `['returned', 'lost']` secara independen
 * (sisa review #171): perubahan kosakata di masa depan — misalnya kondisi
 * baru yang menulis status lain — membuat guard kompensasi diam-diam cocok 0
 * baris SELAMANYA, dan setiap return gagal lalu selalu berakhir 500 +
 * `needsReconciliation: true` tanpa satu tes pun yang menjelaskan kenapa.
 * Satu konstanta + tipe di bawahnya menutup drift itu dari dua sisi: nilai
 * status maju WAJIB anggota daftar (gagal saat typecheck), dan guard
 * kompensasi memfilter dengan daftar yang sama.
 */
export const RETURNED_LOAN_STATUSES = ['returned', 'lost'] as const;
/** Status yang boleh ditulis penulisan maju return (dan dipulihkan kompensasi). */
export type ReturnedLoanStatus = (typeof RETURNED_LOAN_STATUSES)[number];

/** true bila `value` anggota kosakata status hasil return. */
export function isReturnedLoanStatus(value: unknown): value is ReturnedLoanStatus {
  return typeof value === 'string' && (RETURNED_LOAN_STATUSES as readonly string[]).includes(value);
}

export function retryableError(message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: { code: 'SAVE_FAILED', message, retryable: true },
      ...(details === undefined ? {} : { details }),
    },
    { status: 500, headers: { 'Retry-After': '1' } }
  );
}

export async function getFineRate(supabase: SupabaseLike): Promise<number> {
  try {
    const { data } = await supabase
      .from('library_settings')
      .select('fine_per_day')
      .eq('id', 1)
      .single();
    const v = Number((data as { fine_per_day?: unknown } | null)?.fine_per_day);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    // Intentionally empty: fall through to FINE_PER_DAY default below.
  }
  return FINE_PER_DAY;
}

/**
 * KOMPENSASI legacy: loan sudah terupdate tetapi langkah berikut (stok)
 * gagal — coba kembalikan loan ke borrowed agar tidak ada partial state
 * diam-diam. Best-effort: false berarti panggil details.needsReconciliation.
 *
 * 0-baris dipulihkan = kompensasi TIDAK terjadi, bukan kebetulan nol. Baris
 * yang mencocoki `.eq('id', id)` bisa sudah tidak ada tepat di jendela ini:
 * `DELETE /api/loans/[id]` hanya menolak peminjaman BERJALAN, dan loan yang
 * baru saja ditulis statusnya `returned`/`lost` justru lolos guard itu. Kalau
 * keberhasilan hanya diukur dari `error`, PostgREST `{ data: [], error: null }`
 * terbaca SUKSES — `reverted: true` membuat `needsReconciliation` bernilai
 * false padahal baris loan tidak pernah kembali `borrowed` (issue #168). Itu
 * bentuk divergensi diam-diam yang sama seperti #164/#166, jadi gerbang
 * jumlah barisnya harus sama dengan kompensasi stok (`rowsRestored` di bawah).
 *
 * Catatan trade-off (pola sama seperti `tryRevertLoanStock`): nol baris juga
 * bisa berarti baris TIDAK terlihat SELECT oleh klien walau penulisan
 * berhasil. Arah kegagalan itu aman — kompensasi gagal memicu rekonsiliasi,
 * bukan ketenangan palsu. Klien yang menjalankan jalur ini adalah klien staf
 * (`requireStaff`) dengan visibilitas `loans read own or staff`, yaitu group
 * paling longgar untuk baris ini.
 *
 * Guard optimistic-lock/status (paritas penuh dengan guard CAS stok di
 * `tryRevertLoanStock`): penulisan absolut `status: 'borrowed'` hanya
 * dilakukan pada baris yang MASIH berstatus yang baru KITA tulis
 * (`returned`/`lost`) lewat `.in('status', [...RETURNED_LOAN_STATUSES])` —
 * kosakata yang SAMA dengan penulisan maju, satu sumber (sisa review #171). Tanpa
 * guard ini gerbang jumlah baris hanya bisa mendeteksi kasus "baris hilang"
 * (0 baris karena `DELETE`), bukan "baris masih ada tetapi statusnya sudah
 * berubah konkuren sehingga TIDAK seharusnya dibalik" — penulisan absolutnya
 * lalu menimpa perubahan itu diam-diam. Dengan guard, baris yang berubah di
 * belakang kompensasi gagal PERSIS seperti jalur stok (0 baris →
 * `reverted: false` → rekonsiliasi), bukan ditimpa. Ini setengah paritas yang
 * belum tertutup PR #169/#168 (issue #170). Setiap penulis `loans` lain
 * memang sudah diawali guard `borrowed`/`overdue`, dan penulis tak terjaga
 * satu-satunya (`DELETE /api/loans/[id]`) menghapus baris (kasus itu tetap
 * tertangani gerbang jumlah baris), jadi guard ini bertindak sebagai
 * pertahanan-lapis yang gagal ke arah aman.
 */
export async function tryRevertLoanReturn(supabase: SupabaseLike, id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('loans')
      .update({ status: 'borrowed', returned_at: null, fine_amount: 0 })
      .eq('id', id)
      // Guard status/optimistic-lock (issue #170): hanya pulihkan baris yang
      // MASIH `returned`/`lost` — status yang baru DITULIS penulisan maju.
      // Bentuknya sama seperti guard `.in('status', ['borrowed','overdue'])`
      // pada penulisan maju dan guard CAS stok, jadi baris yang berubah
      // konkuren gagal (0 baris) alih-alih ditimpa absolut. Kosakata status
      // diambil dari RETURNED_LOAN_STATUSES — konstanta yang SAMA dipakai
      // penulisan maju, supaya perubahan kosakata tak lagi membuat guard ini
      // diam-diam cocok 0 baris selamanya (sisa review #171).
      .in('status', [...RETURNED_LOAN_STATUSES])
      .select('id');
    return rowsRestored(error, data);
  } catch {
    return false;
  }
}

/** Kolom stok yang bisa tersentuh jalur fallback pengembalian. */
type StockCols = { stock_available: number; stock_total: number };

/**
 * Jejak penulisan stok: nilai SEBELUM (untuk dipulihkan) + SESUDAH (guard
 * CAS), plus penanda kolom mana yang BENAR-BENAR ditulis.
 */
type StockWrite = {
  prior: StockCols;
  wrote: StockCols;
  /** Rusak/hilang menulis dua kolom; kondisi baik hanya `stock_available`. */
  stockTotalWritten: boolean;
};

/**
 * 0-baris dipulihkan = kompensasi TIDAK terjadi, bukan kebetulan nol.
 * Dipakai KEDUA kompensasi (loan dan stok) supaya "tidak ada baris yang
 * dibalik" selalu berarti GAGAL, bukan sukses.
 */
function rowsRestored(error: unknown, data: unknown): boolean {
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * KOMPENSASI stok (issue #164): pulihkan kolom yang sudah DITULIS ke nilai
 * SEBELUM penulisan. Dipanggil bila langkah SETELAH penulisan stok (catat
 * denda) gagal — kalau hanya loan yang dibatalkan, `stock_available` tetap
 * bertambah pada pinjaman yang sudah kembali `borrowed`, sehingga eksemplar
 * yang masih dipinjam terhitung tersedia.
 *
 * Dua hal wajib supaya kompensasi TIDAK berbohong:
 *
 * 1. **Guard CAS** `.eq(col, nilai-yang-sudah-ditulis)`: nilai lama dipulihkan
 *    HANYA bila baris masih memuat nilai yang kita tulis, sehingga penulisan
 *    absolut ini tidak menimpa penambahan stok dari pengembalian lain (pola
 *    optimistic-lock sama seperti `.eq('due_at', l.due_at)` di
 *    `extendLoan.ts`, dan `.in('status', ['borrowed','overdue'])` pada
 *    penulisan loan di atasnya).
 * 2. **`.select('id')` + cek baris terpulihkan**: PostgREST membalas
 *    `{ data: [], error: null }` ketika 0 baris cocok guard CAS. Kalau
 *    keberhasilan hanya diukur dari `error`, kondisi itu terbaca SUKSES —
 *    `stockReverted: true` / `needsReconciliation: false` padahal
 *    `stock_available` masih bertambah. Itu justru bentuk divergensi diam-diam
 *    yang ditutup isu #164, jadi "tidak ada baris" harus berarti gagal.
 *
 *    Catatan trade-off (review PR #167): nol baris juga bisa berarti baris
 *    TIDAK terlihat oleh SELECT klien walau penulisan berhasil. Itu gagal ke
 *    arah AMAN — laporan gagal memicu rekonsiliasi manual, bukan ketenangan
 *    palsu. Arah sebaliknya (menenangkan palsu) adalah bentuk bug #164, jadi
 *    orientasi inilah yang dipilih.
 *
 *    Visibilitas di jalur ini justru PALING LONGGAR antara pembaca `books`:
 *    klien yang menjalankan kompensasi adalah klien staf, dan kebijakan
 *    `staff read books` / `staff update books` (migrasi 0002_rls.sql) tanpa
 *    predikat `is_active` — jadi baris yang baru ditulis klien itu sendiri
 *    tetap terlihat olehnya. Pembaca lain lebih sempit, BUKAN sama:
 *    `GET /api/books` memakai klien anon dengan RLS `is_active = TRUE`, dan
 *    `/api/reports/export` menambah filter `is_active` di query
 *    (`report-export.ts`). Celah hanya muncul bila kebijakan staf kelak
 *    dipisah per-status, dan gejalanya TERLIAT (kompensasi gagal) alih-alih
 *    senyap.
 *
 * Hanya kolom yang benar-benar ditulis yang dipulihkan & dijaga: perubahan
 * tak terkait di baris yang sama (mis. `stock_total` digerakkan pengembalian
 * rusak lain) tidak boleh ikut menggagalkan pemulihan `stock_available`.
 */
export async function tryRevertLoanStock(
  supabase: SupabaseLike,
  bookId: string,
  write: StockWrite
): Promise<boolean> {
  const { prior, wrote, stockTotalWritten } = write;
  try {
    if (stockTotalWritten) {
      // Rusak/hilang: dua kolom berubah — pulihkan keduanya.
      const { data, error } = await supabase
        .from('books')
        .update({ stock_available: prior.stock_available, stock_total: prior.stock_total })
        .eq('id', bookId)
        .eq('stock_available', wrote.stock_available)
        .eq('stock_total', wrote.stock_total)
        .select('id');
      return rowsRestored(error, data);
    }
    const { data, error } = await supabase
      .from('books')
      .update({ stock_available: prior.stock_available })
      .eq('id', bookId)
      .eq('stock_available', wrote.stock_available)
      .select('id');
    return rowsRestored(error, data);
  } catch {
    return false;
  }
}

export type ReturnLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  returnedAt?: Date | string;
  notes?: string;
  /** kondisi kontrak return POST: baik|rusak|hilang. Absen = simple return (PUT paths). */
  kondisi?: string;
};

/**
 * Legacy fallback read-then-write path for returnLoan.
 * Used when RPC is unavailable or fails with 'function not found'.
 * Sequential steps with compensation on mid-sequence failures.
 */
export async function legacyReturnLoan(
  opts: ReturnLoanOptions,
  returnedAt: Date,
  kondisi: string,
  hasKondisi: boolean
): Promise<Response> {
  const { supabase, id } = opts;
  const userId = opts.userId ?? null;

  const { data: loan } = await supabase.from('loans').select('*').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  const l = loan as {
    status: string;
    due_at: string;
    book_id: string;
    member_id: string;
  };
  if (l.status === 'returned' || l.status === 'lost')
    return jsonError('CONFLICT', 'Sudah dikembalikan.', 409);

  const rate = await getFineRate(supabase);
  // Isu #72: denda telat dipatok library_settings.fine_max (0 = tanpa plafon).
  // Jalur utama (RPC return_loan) menjepitnya di DB; ini jalur fallback.
  const fineMax = await getFineMax(supabase);
  const capped = capLateFine(calcFine(l.due_at, returnedAt, rate), fineMax);
  const lateFine = capped.fine;
  // Isu #74: rusak/hilang dikenakan biaya ganti rugi dari settings
  // (library_settings.replacement_fee_damaged / replacement_fee_lost).
  // Jalur utama (RPC return_loan) menghitungnya sendiri di DB — ini jalur
  // fallback bila fungsi belum terdeploy.
  const replacement = await getReplacementFee(supabase, kondisi);
  const fine = lateFine + replacement;

  const cleanNotes = typeof opts.notes === 'string' ? opts.notes.trim().slice(0, 500) : '';
  const noteExtra = cleanNotes ? ` | ${cleanNotes}` : '';
  const replacementNote =
    replacement > 0 ? ` | Biaya ganti rugi (${kondisi}): ${formatRp(replacement)}` : '';
  const capNote = capped.capped ? ` | Denda dipatok maksimum ${formatRp(fineMax)}` : '';

  // Status maju diikat tipe ke RETURNED_LOAN_STATUSES (sisa review #171):
  // nilai di luar kosakata itu gagal saat typecheck, jadi guard kompensasi
  // (`tryRevertLoanReturn`) mustahil lagi ketinggalan dari status yang
  // ditulis di sini — keduanya memakai konstanta yang SAMA, bukan dua daftar
  // yang ditulis independen dan bisa menyimpang tanpa terdeteksi.
  const forwardStatus: ReturnedLoanStatus =
    hasKondisi && kondisi === 'hilang' ? 'lost' : 'returned';

  const updatePayload: Record<string, unknown> = hasKondisi
    ? {
        returned_at: returnedAt.toISOString(),
        status: forwardStatus,
        fine_amount: fine,
        notes: `Kondisi kembali: ${kondisi}${replacementNote}${capNote}${noteExtra}`,
      }
    : {
        returned_at: returnedAt.toISOString(),
        status: forwardStatus,
        fine_amount: fine,
        ...(cleanNotes ? { notes: cleanNotes } : {}),
      };

  const { data, error } = await supabase
    .from('loans')
    .update(updatePayload)
    .eq('id', id)
    // RACE-01: conditional write — dua return konkuren, hanya 1 yang menang.
    // Mock lama tanpa .in tetap lolos (chainable); 0-baris/error -> 409.
    // Daftar status AKTIF diambil dari ACTIVE_LOAN_STATUSES — satu sumber yang
    // SAMA dipakai DELETE /api/loans/[id] (isActiveLoanStatus) dan dikunci
    // sebagai cermin CHECK DB (0001_core.sql:152). Daftar literal di sini + di
    // tes (expectLoanForwardShape) dulu bisa basi BERSAMA tanpa satu tes pun
    // gagal: status aktif baru masuk ACTIVE_LOAN_STATUSES tapi filter penulisan
    // maju tetap tidak mengenalnya → return 0-baris → 409 "sudah diproses
    // peminjam lain" SELAMNYA tanpa tes yang menjelaskan (issue #174).
    .in('status', [...ACTIVE_LOAN_STATUSES])
    .select()
    .single();
  if (error || !data) {
    // 0-baris = pemenang konkuren sudah memproses -> 409. Klasifikasi SATU
    // SUMBER dengan PUT reservasi + extend (@/lib/zero-rows): kode PERSIS +
    // frasa kanonik, bukan substring gabungan `message + code` yang membuat
    // kegagalan DB sungguhan (`22P02 … "406"`, `22001 … 406`) ikut jadi 409
    // (issue #179, masih hidup di berkas ini sampai issue #181).
    if (!data && isZeroRows(error)) {
      return jsonError('CONFLICT', 'Peminjaman sudah diproses peminjam lain.', 409);
    }
    return retryableError(
      'Gagal memproses pengembalian. Silakan coba lagi.',
      (error as { message?: string } | null)?.message
    );
  }

  // RETURN-CLAMP: Math.min(stock_total, available+1) agar return konkuren
  // ganda / stok penuh tidak pernah melebihi stock_total.
  const { data: book } = await supabase
    .from('books')
    .select('stock_available,stock_total')
    .eq('id', l.book_id)
    .single();
  // Catat nilai stok SEBELUM/SESUDAH penulisan: kalau langkah BERIKUTNYA
  // (denda) gagal, kompensasi wajib mengembalikan nilai SEBELUM, bukan hanya
  // membatalkan loan (issue #164).
  let stockWrite: StockWrite | null = null;

  if (book) {
    const b = book as { stock_available: number; stock_total: number };
    const prior: StockCols = {
      stock_available: b.stock_available,
      stock_total: b.stock_total,
    };
    // Rusak/hilang: satu eksemplar keluar dari peredaran — keduanya berubah.
    // Baik: satu eksemplar kembali ke rak — hanya stock_available yang
    // ditulis (bentuk payload sama seperti sebelum isu #164).
    const damaged = hasKondisi && kondisi !== 'baik';
    const wrote: StockCols = damaged
      ? {
          stock_total: Math.max(0, b.stock_total - 1),
          stock_available: Math.min(Math.max(0, b.stock_available), Math.max(0, b.stock_total - 1)),
        }
      : {
          stock_available: Math.min(b.stock_total, b.stock_available + 1),
          stock_total: prior.stock_total,
        };
    const payload = damaged
      ? { stock_total: wrote.stock_total, stock_available: wrote.stock_available }
      : { stock_available: wrote.stock_available };
    const { error: stockErr } = await supabase.from('books').update(payload).eq('id', l.book_id);
    if (stockErr) {
      // Penulisan stok GAGAL — tak ada yang perlu dibalik dari tabel books.
      const reverted = await tryRevertLoanReturn(supabase, id);
      return retryableError('Pengembalian tersimpan, stok gagal diperbarui. Silakan coba lagi.', {
        reason: stockErr.message,
        reverted,
        needsReconciliation: !reverted,
      });
    }
    stockWrite = {
      prior,
      wrote,
      stockTotalWritten: damaged,
    };
  }

  if (fine > 0) {
    const { error: fineErr } = await supabase.from('fines').insert({
      loan_id: id,
      member_id: l.member_id,
      amount: fine,
      status: 'unpaid',
      notes:
        `Denda keterlambatan otomatis Rp${rate}/hari (due ${l.due_at}).` +
        (capped.capped ? ` Denda dipatok maksimum Rp${fineMax} (setelan plafon denda).` : '') +
        (replacement > 0 ? ` Biaya ganti rugi (${kondisi}): Rp${replacement}.` : '') +
        (hasKondisi ? ` Kondisi: ${kondisi}.` : ''),
    });
    if (fineErr) {
      const loanReverted = await tryRevertLoanReturn(supabase, id);
      // KOMPENSASI STOK (issue #164): penulisan stok SUDAH sukses sebelum
      // denda dicatat, jadi ia wajib ikut dibatalkan. Tanpa ini loan kembali
      // ke `borrowed` sementara `stock_available` tetap bertambah — eksemplar
      // yang masih dipinjam terhitung tersedia, lalu checkout berikutnya
      // membuat dua pinjaman aktif untuk satu eksemplar, dan korupsinya tidak
      // pernah pulih sendiri (pengembalian berikutnya menjepit dengan
      // Math.min(stock_total, …)). `book` null = stok tak pernah dibaca/
      // ditulis, tak ada yang perlu dibalik.
      const stockReverted = stockWrite
        ? await tryRevertLoanStock(supabase, l.book_id, stockWrite)
        : true;
      return retryableError('Pengembalian tersimpan, denda gagal dicatat. Silakan coba lagi.', {
        reason: fineErr.message,
        reverted: loanReverted,
        stockReverted,
        // "Konsisten" hanya bila KEDUA kompensasi sukses — bukan loan saja.
        needsReconciliation: !loanReverted || !stockReverted,
      });
    }
  }

  const auditPayload = {
    user_id: userId,
    action: 'loans.return',
    entity_type: 'loans',
    entity_id: id,
    metadata: hasKondisi
      ? {
          fine,
          late_fine: lateFine,
          replacement_fee: replacement,
          kondisi,
          book_id: l.book_id,
          capped: capped.capped,
          fine_max: fineMax,
        }
      : { fine, late_fine: lateFine, capped: capped.capped, fine_max: fineMax },
  };
  const firstAudit = await supabase.from('activity_logs').insert(auditPayload);
  if (firstAudit.error) {
    createLogger().warn('audit.activity_logs_retry', { detail: firstAudit.error.message });
    const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
    if (retryAudit.error) {
      createLogger().error('audit.activity_logs_failed', {
        detail: retryAudit.error.message,
        entity_id: id,
      });
    }
  }

  return NextResponse.json({ data });
}
