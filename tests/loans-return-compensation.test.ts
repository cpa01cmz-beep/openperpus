import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Keandalan & Pengujian — kompensasi legacyReturnLoan (chaos mid-sequence).
// Memaksa kegagalan di tengah sekuens (stok / denda) dan memastikan rollback
// best-effort + surfacing needsReconciliation, tanpa partial diam-diam.
//
// Issue #164: kegagalan insert DENDA terjadi SETELAH penulisan stok sukses,
// jadi kompensasi wajib membalik KEDUANYA (loan + stok). Sebelumnya hanya loan
// yang dibalik sehingga stock_available tetap bertambah pada pinjaman yang
// sudah kembali `borrowed` — eksemplar yang masih dipinjam terhitung tersedia.
//
// Issue #168: kompensasi LOAN juga wajib memakai gerbang jumlah baris. Tanpa
// itu `reverted: true` bisa dilaporkan saat 0 baris terpulihkan, dan
// `needsReconciliation` turun ke false padahal loan tidak pernah kembali
// `borrowed` — sisa PR #167 yang hanya memasang gerbang di kompensasi stok.
//
// Issue #170 (sisa review #169): (1) kompensasi loan kini memakai guard
// status/optimistic-lock `.in('status', ['returned','lost'])` — paritas penuh
// dengan guard CAS stok; (2) mock kompensasi loan merekam payload + guard
// `.eq`/`.in` (cerminan `BookWrite`) supaya regresi kompensasi tak lagi lolos;
// (3) gerbang 0-baris loan juga diuji di cabang stok-gagal (CHAOS-11).
//
// Issue #172 (sisa review #171): (1) kosakata status return jadi SATU
// konstanta `RETURNED_LOAN_STATUSES` — dipakai bersama penulisan maju DAN
// guard kompensasi, dikunci tes paritas dua arah; (2) penulisan MAJU loan
// kini juga di-assert (guard `.eq` + `.in` RACE-01), bukan hanya dikoleksi;
// (3) CHAOS-11 meng-assert status/payload respons seperti chaos test lain.

import { isReturnedLoanStatus, RETURNED_LOAN_STATUSES } from '@/lib/legacyReturn';
import { returnLoan } from '@/lib/loans-return';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

/** Satu penulisan ke tabel `books`: payload, guard CAS, dan jenis (maju/balik). */
type BookWrite = {
  payload: Record<string, unknown>;
  guards: Array<[string, unknown]>;
  kind: 'forward' | 'revert';
};

/**
 * Satu penulisan ke tabel `loans`: payload, guard `.eq` + filter `.in`, dan
 * jenis (maju/balik). Cerminan `BookWrite` — supaya mock kompensasi loan punya
 * kuat falsifikasi yang sama (review PR #169: tanpa merekam eq/payload,
 * regresi seperti drop `.eq('id', id)` atau drop `returned_at`/`fine_amount`
 * lolos semua chaos test).
 */
type LoanWrite = {
  payload: Record<string, unknown>;
  guards: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  kind: 'forward' | 'revert';
};

function makeLegacyMock(opts: {
  failBooksUpdate?: boolean;
  failFinesInsert?: boolean;
  failRevert?: boolean;
  failStockRevert?: boolean;
  /** Guard CAS tidak cocok: PostgREST membalas 0 baris, `error: null`. */
  stockRevertNoRows?: boolean;
  /** Loan hilang di tengah sekuens: reverts 0 baris, `error: null`. */
  loanRevertNoRows?: boolean;
  log: string[];
  booksWrites: BookWrite[];
  loanWrites: LoanWrite[];
  book?: { stock_available: number; stock_total: number };
}) {
  const { log, booksWrites, loanWrites } = opts;
  const loan = {
    id: 'L-9',
    status: 'borrowed',
    due_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    book_id: BID,
    member_id: MID,
  };
  const book = opts.book ?? { stock_available: 1, stock_total: 5 };

  const from = vi.fn((table: string) => {
    if (table === 'loans') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: loan, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          // Kompensasi loan: satu-satunya penulis `loans` yang menulis `status`
          // KEMBALI ke `borrowed` (dengan returned_at:null, fine_amount:0).
          // Penulisan maju return menulis `returned`/`lost`, jadi `status:
          // 'borrowed'` membedakan revert vs forward.
          const isRevert = (payload as Record<string, unknown>)?.status === 'borrowed';
          const entry: LoanWrite = {
            payload,
            guards: [],
            in: [],
            kind: isRevert ? 'revert' : 'forward',
          };
          loanWrites.push(entry);
          // Node berantai untuk MAJU (.eq('id', …).in('status', …).select()
          // .single()) dan BALIK (.eq('id', …).in('status', …).select('id')).
          // Merekam tiap `.eq`/`.in` ke entry supaya guard kompensasi bisa
          // di-assert, bukan dibuang diam-diam (review PR #169).
          const node = {
            error: null,
            eq: (col: string, val: unknown) => {
              entry.guards.push([col, val]);
              return node;
            },
            in: (col: string, vals: unknown[]) => {
              entry.in.push([col, vals]);
              return node;
            },
            select: () => {
              if (isRevert) {
                log.push('revert-loan');
                // Bentuk sama seperti kompensasi stok: .eq('id', …).in(…)
                // .select('id') → { data, error }. 0 baris = kompensasi TIDAK
                // terjadi (issue #168). nodes await langsung (bukan .single).
                return {
                  data: opts.failRevert ? null : opts.loanRevertNoRows ? [] : [{ id: 'L-9' }],
                  error: opts.failRevert ? { message: 'revert boom' } : null,
                };
              }
              log.push('update-loan');
              return { single: async () => ({ data: { ...loan, ...payload }, error: null }) };
            },
          };
          return node;
        },
      };
    }
    if (table === 'books') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: book, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          const entry: BookWrite = { payload, guards: [], kind: 'forward' };
          booksWrites.push(entry);
          // Satu node berantai untuk KEDUA bentuk penulisan:
          // - maju:   .update(p).eq('id', …) lalu langsung di-await  → { error }
          // - balik:  .update(p).eq('id', …).eq(…)… .select('id')   → { data, error }
          // Node sengaja BUKAN thenable, sama seperti respons PostgREST asli.
          const node = {
            error: opts.failBooksUpdate ? { message: 'stock boom' } : null,
            eq: (col: string, val: unknown) => {
              entry.guards.push([col, val]);
              return node;
            },
            select: () => {
              // Hanya penulisan pembalikan yang memakai .select('id').
              entry.kind = 'revert';
              return {
                data: opts.stockRevertNoRows ? [] : [{ id: BID }],
                error: opts.failStockRevert ? { message: 'revert stock boom' } : null,
              };
            },
          };
          return node;
        },
      };
    }
    if (table === 'fines') {
      return {
        insert: async () => {
          log.push('insert-fines');
          if (opts.failFinesInsert) return { error: { message: 'fines boom' } };
          return { error: null };
        },
      };
    }
    if (table === 'activity_logs') {
      return { insert: async () => ({ error: null }) };
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  // Tanpa .rpc → paksa jalur legacy.
  return { from };
}

/** Hasil kompensasi pada respons 500 legacy. */
type ChaosDetails = {
  reason: string;
  reverted: boolean;
  stockReverted?: boolean;
  needsReconciliation: boolean;
};

async function chaosResponse(opts: Parameters<typeof makeLegacyMock>[0], kondisi?: string) {
  const supabase = makeLegacyMock(opts);
  const res = await returnLoan({
    supabase: supabase as never,
    id: 'L-9',
    userId: 'U-1',
    ...(kondisi ? { kondisi } : {}),
  });
  const j = (await res.json()) as {
    error: { code: string; message: string };
    details: ChaosDetails;
  };
  return { res, j };
}

/**
 * Bentuk kompensasi loan yang BENAR (review PR #169). Mock kini merekam payload
 * + guard `.eq` + filter `.in` (cerminan `BookWrite`), sehingga regresi yang
 * dulu lolos semua chaos test kini menggagalkannya:
 *   - drop/typo-salah `.eq('id', id)`  → guards tak lagi `[['id','L-9']]`
 *   - drop `returned_at`/`fine_amount` → payload berubah
 *   - drop guard status (issue #170)   → `in` tak lagi berisi `['returned','lost']`
 *
 * Filter `.in` dicocokkan dengan konstanta `RETURNED_LOAN_STATUSES` yang SAMA
 * dipakai penulisan maju (sisa review #171) — daftar yang ditulis ulang di tes
 * justru yang dulu bisa menyimpang dari produksi tanpa terdeteksi.
 */
function expectLoanRevertShape(loanWrites: LoanWrite[]) {
  const revert = loanWrites.filter((w) => w.kind === 'revert');
  expect(revert).toHaveLength(1);
  expect(revert[0]?.payload).toEqual({ status: 'borrowed', returned_at: null, fine_amount: 0 });
  expect(revert[0]?.guards).toEqual([['id', 'L-9']]);
  expect(revert[0]?.in).toEqual([['status', [...RETURNED_LOAN_STATUSES]]]);
}

/**
 * Bentuk penulisan MAJU return yang BENAR (sisa review #171). Mock memang
 * mencatat entri `loanWrites` `kind: 'forward'`, tapi sebelumnya TIDAK ada tes
 * yang meng-assert-nya — koleksi tanpa assertion, sehingga drop guard RACE-01
 * `.in('status', ['borrowed','overdue'])` (`legacyReturn.ts:262`) masih lolos
 * SEMUA chaos test. Asimetris dengan `BookWrite` maju yang sudah di-assert;
 * helper ini menutupinya:
 *   - drop `.eq('id', id)`      → guards tak lagi `[['id','L-9']]`
 *   - drop guard RACE-01 `.in`  → `in` kosong
 *   - status maju di luar `RETURNED_LOAN_STATUSES` → paritas kosakata gagal
 *     (guard kompensasi tak akan pernah cocok baris itu lagi, dan setiap
 *     return gagal jadi 500 + needsReconciliation tanpa penjelasan).
 */
function expectLoanForwardShape(loanWrites: LoanWrite[]) {
  const forward = loanWrites.filter((w) => w.kind === 'forward');
  expect(forward).toHaveLength(1);
  expect(forward[0]?.guards).toEqual([['id', 'L-9']]);
  expect(forward[0]?.in).toEqual([['status', ['borrowed', 'overdue']]]);
  expect(isReturnedLoanStatus(forward[0]?.payload.status)).toBe(true);
}

describe('loans-return legacy compensation (chaos)', () => {
  it('CHAOS-01 stok gagal mid-sequence → 500 + revert loan dicoba + reverted:true', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { res, j } = await chaosResponse({ log, booksWrites, loanWrites, failBooksUpdate: true });
    expect(res.status).toBe(500);
    expect(j.error.code).toBe('SAVE_FAILED');
    expect(j.error.message).toContain('stok gagal diperbarui');
    expect(log).toContain('update-loan');
    expect(log).toContain('revert-loan');
    expect(j.details.reverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);
    // Penulisan stok GAGAL → tak ada yang perlu dibalik dari books.
    expect(booksWrites.filter((w) => w.kind === 'revert')).toHaveLength(0);
  });

  it('CHAOS-02 stok gagal + revert ikut gagal → needsReconciliation:true (tidak diam)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failBooksUpdate: true,
      failRevert: true,
    });
    expect(j.details.reverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
  });

  it('CHAOS-03 denda gagal → loan DAN stok ikut dibalik ke nilai sebelum kembali (#164)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { res, j } = await chaosResponse({ log, booksWrites, loanWrites, failFinesInsert: true });
    expect(res.status).toBe(500);
    expect(j.error.message).toContain('denda gagal dicatat');
    expect(log).toContain('insert-fines');
    expect(log).toContain('revert-loan');
    expect(j.details.reverted).toBe(true);
    expect(j.details.stockReverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);

    // Inti perbaikan #164: stok sudah dinaikkan lalu WAJIB diturunkan lagi.
    const revert = booksWrites.filter((w) => w.kind === 'revert');
    expect(revert).toHaveLength(1);
    // Kondisi baik hanya MENULIS stock_available, jadi hanya itu yang
    // dipulihkan — perubahan tak terkait di baris yang sama tidak boleh ikut
    // menggagalkan pemulihan.
    expect(revert[0]?.payload).toEqual({ stock_available: 1 });
    // Dijaga CAS pada nilai yang SUDAH ditulis (2), supaya penambahan stok
    // dari pengembalian lain tidak tertimpa penulisan absolut ini.
    expect(revert[0]?.guards).toEqual([
      ['id', BID],
      ['stock_available', 2],
    ]);
    // Tulisan maju memang menaikkan stock_available 1 → 2.
    const forward = booksWrites.filter((w) => w.kind === 'forward');
    expect(forward).toHaveLength(1);
    expect(forward[0]?.payload).toEqual({ stock_available: 2 });
    // Kompensasi loan kini MEMBUKA bentuk revert-nya (review PR #169): payload +
    // guard `.eq('id', id)` + filter status — bukan dibuang diam-diam seperti
    // mock loans sebelumnya.
    expectLoanRevertShape(loanWrites);
    // Penulisan maju juga di-assert (sisa review #171): tanpa ini drop guard
    // RACE-01 `.in('status', ['borrowed','overdue'])` tetap lolos semua tes.
    expectLoanForwardShape(loanWrites);
  });

  it('CHAOS-04 denda gagal + pembalikan stok gagal → needsReconciliation:true (tidak diam)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failFinesInsert: true,
      failStockRevert: true,
    });
    expect(j.details.reverted).toBe(true);
    expect(j.details.stockReverted).toBe(false);
    // Loan saja berhasil dibalik TIDAK cukup: stok masih menyimpang.
    expect(j.details.needsReconciliation).toBe(true);
    expect(booksWrites.filter((w) => w.kind === 'revert')).toHaveLength(1);
  });

  it('CHAOS-05 denda gagal + revert loan gagal, pembalikan stok tetap dicoba', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failFinesInsert: true,
      failRevert: true,
      failStockRevert: true,
    });
    expect(j.details.reverted).toBe(false);
    expect(j.details.stockReverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
    // Kompensasi stok TIDAK terlewat hanya karena kompensasi loan gagal.
    expect(booksWrites.filter((w) => w.kind === 'revert')).toHaveLength(1);
  });

  it('CHAOS-06 kondisi rusak → stock_total DIPULIHKAN, bukan hanya stock_available', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse(
      { log, booksWrites, loanWrites, failFinesInsert: true },
      'rusak'
    );
    expect(j.details.stockReverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);
    const revert = booksWrites.filter((w) => w.kind === 'revert');
    expect(revert).toHaveLength(1);
    // Rusak menulis DUA kolom (stock_total 5→4, stock_available dijepit),
    // jadi keduanya dipulihkan & dijaga — bukan hanya stock_available.
    expect(revert[0]?.payload).toEqual({ stock_available: 1, stock_total: 5 });
    expect(revert[0]?.guards).toEqual([
      ['id', BID],
      ['stock_available', 1],
      ['stock_total', 4],
    ]);
    const forward = booksWrites.filter((w) => w.kind === 'forward');
    expect(forward[0]?.payload).toEqual({ stock_total: 4, stock_available: 1 });
  });

  it('CHAOS-07 jalan lengkap tanpa kegagalan → 200 + TANPA penulisan pembalikan', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { res, j } = await chaosResponse({ log, booksWrites, loanWrites });
    expect(res.status).toBe(200);
    expect(j.error).toBeUndefined();
    // Kompensasi hanya untuk jalur gagal — ekspor normal tak boleh menyentuh
    // buku dua kali.
    expect(booksWrites).toHaveLength(1);
    expect(booksWrites[0]?.kind).toBe('forward');
    expect(booksWrites[0]?.payload).toEqual({ stock_available: 2 });
    expect(booksWrites[0]?.guards).toHaveLength(1);
    // Jalur lengkap = satu-satunya chaos test tanpa kompensasi: bentuk
    // penulisan maju loan dikunci di sini (sisa review #171).
    expectLoanForwardShape(loanWrites);
  });

  it('CHAOS-08 guard CAS tidak cocok (0 baris, error null) → stockReverted:false, bukan sukses', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failFinesInsert: true,
      stockRevertNoRows: true,
    });
    expect(j.details.reverted).toBe(true);
    // PostgREST membalas { data: [], error: null } saat 0 baris cocok guard CAS.
    // Kalau keberhasilan hanya diukur dari `error`, ini terbaca SUKSES —
    // divergensi diam-diam yang sama dengan yang ditutup #164.
    expect(j.details.stockReverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
    // Penulisan pembalikan memang dicoba, hanya tidak mengenai baris mana pun.
    expect(booksWrites.filter((w) => w.kind === 'revert')).toHaveLength(1);
  });

  it('CHAOS-09 kondisi rusak + guard CAS tak cocok (0 baris) → cabang 2 kolom juga gagal terlihat', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse(
      { log, booksWrites, loanWrites, failFinesInsert: true, stockRevertNoRows: true },
      'rusak'
    );
    expect(j.details.stockReverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
    const revert = booksWrites.filter((w) => w.kind === 'revert');
    expect(revert).toHaveLength(1);
    // Cabang rusak/hilang tetap menulis DUA kolom walau guard tidak kena —
    // pembalikan parsial tidak boleh kelihatan "berhasil".
    expect(revert[0]?.payload).toEqual({ stock_available: 1, stock_total: 5 });
    expect(revert[0]?.guards).toEqual([
      ['id', BID],
      ['stock_available', 1],
      ['stock_total', 4],
    ]);
  });

  it('CHAOS-10 loan hilang di tengah sekuens (0 baris, error null) → reverted:false, bukan sukses', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failFinesInsert: true,
      loanRevertNoRows: true,
    });
    expect(log).toContain('revert-loan');
    // `DELETE /api/loans/[id]` hanya menolak peminjaman BERJALAN — loan yang
    // baru ditulis `returned` justru lolos guard itu, jadi baris bisa lenyap
    // tepat di jendela kompensasi. PostgREST lalu membalas
    // `{ data: [], error: null }`. Kalau keberhasilan hanya diukur dari
    // `error`, kondisi ini terbaca SUKSES dan `reverted: true` palsu membuat
    // `needsReconciliation` bernilai false padahal loan tidak pernah kembali
    // `borrowed` — bentuk divergensi diam-diam yang sama seperti #164/#166,
    // hanya di sisi loan (issue #168).
    expect(j.details.reverted).toBe(false);
    // Kompensasi stok memang berhasil: justru KEDUA-true inilah yang dulu
    // melaporkan "konsisten, tak perlu direkonsiliasi".
    expect(j.details.stockReverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(true);
    // Meski 0 baris cocok, penulisan kompensasi loan TETAP dicoba dengan guard
    // lengkap — bentuknya dikunci oleh mock (review PR #169).
    expectLoanRevertShape(loanWrites);
    // Bentuk penulisan MAJU juga dikunci (sisa review #171).
    expectLoanForwardShape(loanWrites);
  });

  it('CHAOS-11 stok gagal + kompensasi loan 0 baris → reverted:false + needsReconciliation:true (cabang books)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const loanWrites: LoanWrite[] = [];
    const { res, j } = await chaosResponse({
      log,
      booksWrites,
      loanWrites,
      failBooksUpdate: true,
      loanRevertNoRows: true,
    });
    // Cabang stok-gagal juga 500 retryable dengan payload SAVE_FAILED —
    // di-assert seperti CHAOS-01 supaya pergeseran status/payload cabang ini
    // terdeteksi (sisa review #171: CHAOS-11 dulu tanpa assert ini).
    expect(res.status).toBe(500);
    expect(j.error.code).toBe('SAVE_FAILED');
    expect(j.error.message).toContain('stok gagal diperbarui');
    expect(log).toContain('revert-loan');
    // Gerbang 0-baris (issue #168) juga wajib terlihat di cabang STOK-gagal
    // (legacyReturn.ts:319, needsReconciliation: !reverted di :323) — bukan
    // hanya cabang denda-gagal yang sudah dicakup CHAOS-10. CHAOS-01 menguji
    // cabang ini dengan revert loan SUKSES; di sini revert loan 0-baris → gagal
    // terlihat.
    expect(j.details.reverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
    // Penulisan stok GAGAL → tak ada pembalikan books (seperti CHAOS-01), tapi
    // kompensasi loan memang dicoba dengan guard lengkap.
    expect(booksWrites.filter((w) => w.kind === 'revert')).toHaveLength(0);
    expectLoanRevertShape(loanWrites);
    // Bentuk penulisan MAJU juga dikunci (sisa review #171).
    expectLoanForwardShape(loanWrites);
  });
});
