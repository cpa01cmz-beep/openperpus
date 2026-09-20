import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Keandalan & Pengujian — kompensasi legacyReturnLoan (chaos mid-sequence).
// Memaksa kegagalan di tengah sekuens (stok / denda) dan memastikan
// rollback best-effort + surfacing needsReconciliation, tanpa partial diam-diam.

import { returnLoan } from '@/lib/loans-return';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function makeLegacyMock(opts: {
  failBooksUpdate?: boolean;
  failFinesInsert?: boolean;
  failRevert?: boolean;
  log: string[];
}) {
  const { log } = opts;
  const loan = {
    id: 'L-9',
    status: 'borrowed',
    due_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    book_id: BID,
    member_id: MID,
  };
  const book = { stock_available: 1, stock_total: 5 };

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
            return {
              error: null,
              select: () => ({
                single: async () => ({ data: { ...loan, ...payload }, error: null }),
              }),
            };
          },
        }),
      };
    }
    if (table === 'books') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: book, error: null }) }) }),
        update: () => ({
          eq: () => {
            log.push('update-books');
            if (opts.failBooksUpdate) return { error: { message: 'stock boom' } };
            return { error: null };
          },
        }),
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

describe('loans-return legacy compensation (chaos)', () => {
  it('CHAOS-01 stok gagal mid-sequence → 500 + revert loan dicoba + reverted:true', async () => {
    const log: string[] = [];
    const supabase = makeLegacyMock({ log, failBooksUpdate: true });
    const res = await returnLoan({ supabase: supabase as never, id: 'L-9', userId: 'U-1' });
    expect(res.status).toBe(500);
    const j = (await res.json()) as {
      error: { code: string; message: string };
      details: { reason: string; reverted: boolean; needsReconciliation: boolean };
    };
    expect(j.error.code).toBe('SAVE_FAILED');
    expect(j.error.message).toContain('stok gagal diperbarui');
    expect(log).toContain('update-loan');
    expect(log).toContain('update-books');
    expect(log).toContain('revert-loan');
    expect(j.details.reverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);
  });

  it('CHAOS-02 stok gagal + revert ikut gagal → needsReconciliation:true (tidak diam)', async () => {
    const log: string[] = [];
    const supabase = makeLegacyMock({ log, failBooksUpdate: true, failRevert: true });
    const res = await returnLoan({ supabase: supabase as never, id: 'L-9', userId: 'U-1' });
    expect(res.status).toBe(500);
    const j = (await res.json()) as {
      details: { reverted: boolean; needsReconciliation: boolean };
    };
    expect(j.details.reverted).toBe(false);
    expect(j.details.needsReconciliation).toBe(true);
  });

  it('CHAOS-03 denda gagal mid-sequence → 500 + revert loan + needsReconciliation:false', async () => {
    const log: string[] = [];
    const supabase = makeLegacyMock({ log, failFinesInsert: true });
    const res = await returnLoan({ supabase: supabase as never, id: 'L-9', userId: 'U-1' });
    expect(res.status).toBe(500);
    const j = (await res.json()) as {
      error: { message: string };
      details: { reverted: boolean; needsReconciliation: boolean };
    };
    expect(j.error.message).toContain('denda gagal dicatat');
    expect(log).toContain('insert-fines');
    expect(log).toContain('revert-loan');
    expect(j.details.reverted).toBe(true);
    expect(j.details.needsReconciliation).toBe(false);
  });
});
