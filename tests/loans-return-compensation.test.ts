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

import { returnLoan } from '@/lib/loans-return';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

/** Satu penulisan ke tabel `books`: payload, guard CAS, dan jenis (maju/balik). */
type BookWrite = {
  payload: Record<string, unknown>;
  guards: Array<[string, unknown]>;
  kind: 'forward' | 'revert';
};

function makeLegacyMock(opts: {
  failBooksUpdate?: boolean;
  failFinesInsert?: boolean;
  failRevert?: boolean;
  failStockRevert?: boolean;
  log: string[];
  booksWrites: BookWrite[];
  book?: { stock_available: number; stock_total: number };
}) {
  const { log, booksWrites } = opts;
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
        update: (payload: Record<string, unknown>) => ({
          eq: () => {
            if ((payload as Record<string, unknown>)?.status === 'borrowed') {
              log.push('revert-loan');
              if (opts.failRevert) return { error: { message: 'revert boom' } };
              return { error: null };
            }
            log.push('update-loan');
            const r: Record<string, unknown> = {
              error: null,
              select: () => ({
                single: async () => ({ data: { ...loan, ...payload }, error: null }),
              }),
            };
            r.in = () => r;
            return r;
          },
        }),
      };
    }
    if (table === 'books') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: book, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          const entry: BookWrite = { payload, guards: [], kind: 'forward' };
          return {
            eq: (col: string, val: unknown) => {
              entry.guards.push([col, val]);
              booksWrites.push(entry);
              return {
                // Tanpa failBooksUpdate, objek ini MURNI (bukan thenable) dan
                // langsung di-await — persis seperti respons PostgREST.
                error: opts.failBooksUpdate ? { message: 'stock boom' } : null,
                eq: (c2: string, v2: unknown) => ({
                  error: null,
                  eq: (c3: string, v3: unknown) => {
                    // Tiga .eq = penulisan pembalikan (guard CAS .eq(id) +
                    // .eq(stock_available) + .eq(stock_total)).
                    entry.kind = 'revert';
                    entry.guards.push([c2, v2], [c3, v3]);
                    return {
                      error: opts.failStockRevert ? { message: 'revert stock boom' } : null,
                    };
                  },
                }),
              };
            },
          };
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

describe('loans-return legacy compensation (chaos)', () => {
  it('CHAOS-01 stok gagal mid-sequence → 500 + revert loan dicoba + reverted:true', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const { res, j } = await chaosResponse({ log, booksWrites, failBooksUpdate: true });
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
    const { j } = await chaosResponse({
      log,
      booksWrites,
      failBooksUpdate: true,
      failRevert: true,
    });
    expect(j.details.reverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
  });

  it('CHAOS-03 denda gagal → loan DAN stok ikut dibalik ke nilai sebelum kembali (#164)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const { res, j } = await chaosResponse({ log, booksWrites, failFinesInsert: true });
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
    // Nilai SEBELUM peminjaman dikembalikan utuh: 1 tersedia dari 5 total.
    expect(revert[0]?.payload).toEqual({ stock_available: 1, stock_total: 5 });
    // Dijaga CAS pada nilai yang SUDAH ditulis (2), supaya penambahan stok
    // dari pengembalian lain tidak tertimpa penulisan absolut ini.
    expect(revert[0]?.guards).toEqual([
      ['id', BID],
      ['stock_available', 2],
      ['stock_total', 5],
    ]);
    // Tulisan maju memang menaikkan stock_available 1 → 2.
    const forward = booksWrites.filter((w) => w.kind === 'forward');
    expect(forward).toHaveLength(1);
    expect(forward[0]?.payload).toEqual({ stock_available: 2 });
  });

  it('CHAOS-04 denda gagal + pembalikan stok gagal → needsReconciliation:true (tidak diam)', async () => {
    const log: string[] = [];
    const booksWrites: BookWrite[] = [];
    const { j } = await chaosResponse({
      log,
      booksWrites,
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
    const { j } = await chaosResponse({
      log,
      booksWrites,
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
    const { j } = await chaosResponse({ log, booksWrites, failFinesInsert: true }, 'rusak');
    expect(j.details.stockReverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);
    const revert = booksWrites.filter((w) => w.kind === 'revert');
    expect(revert).toHaveLength(1);
    // 5 total → 4 saat rusak; pembalikan mengembalikan 5 + 1 tersedia.
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
    const { res, j } = await chaosResponse({ log, booksWrites });
    expect(res.status).toBe(200);
    expect(j.error).toBeUndefined();
    // Kompensasi hanya untuk jalur gagal — ekspor normal tak boleh menyentuh
    // buku dua kali.
    expect(booksWrites).toHaveLength(1);
    expect(booksWrites[0]?.kind).toBe('forward');
    expect(booksWrites[0]?.payload).toEqual({ stock_available: 2 });
    expect(booksWrites[0]?.guards).toHaveLength(1);
  });
});
