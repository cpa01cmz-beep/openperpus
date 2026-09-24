import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi3 RETURN-SINGLE-01..04 — characterization RED→GREEN.
// Single-source: src/lib/loans-return.ts owns 409 guard + calcFine +
// Math.min stock clamp + fines insert + audit; 3 routes thin aliases.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

type MockSupabase = Record<string, unknown>;
function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

// Full-flow mock: loans fetch + update, books fetch + update capture,
// fines insert counter, activity_logs insert ok.
function setReturnFlowMock(opts: {
  loan: Record<string, unknown>;
  book: { stock_available: number; stock_total: number };
  capture: { bookUpdate: Record<string, unknown> | null; finesInserts: unknown[] };
}) {
  const { loan, book, capture } = opts;
  const from = vi.fn((table: string) => {
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      let payload: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        payload = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: { ...loan, ...(payload ?? {}) }, error: null };
        return { data: loan, error: null };
      };
      return chain;
    }
    if (table === 'books') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        capture.bookUpdate = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: { ...book, ...(capture.bookUpdate ?? {}) }, error: null };
        return { data: book, error: null };
      };
      return chain;
    }
    if (table === 'fines') {
      return {
        insert: async (row: unknown) => {
          capture.finesInserts.push(row);
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
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
  });
}

describe('S-roi3 return single-source', () => {
  it('RETURN-SINGLE-01 tiga route memanggil helper yang sama', async () => {
    const mod = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: unknown;
    };
    expect(typeof mod.returnLoan, 'RED: src/lib/loans-return.ts must export returnLoan').toBe(
      'function'
    );
    const collective = read('src/app/api/loans/route.ts');
    const alias = read('src/app/api/loans/[id]/route.ts');
    const single = read('src/app/api/loans/[id]/return/route.ts');
    for (const [name, src] of [
      ['collective PUT', collective],
      ['alias PUT', alias],
      ['return POST', single],
    ] as const) {
      expect(src, `RED: ${name} must call returnLoan`).toContain('returnLoan');
    }
    for (const [name, src] of [
      ['collective PUT', collective],
      ['alias PUT', alias],
      ['return POST', single],
    ] as const) {
      expect(src, `RED: guard must live only in helper, not in ${name}`).not.toContain(
        'Sudah dikembalikan'
      );
    }
  });

  it('RETURN-SINGLE-02 kontrak 409 dan pesan tidak berubah', async () => {
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    setReturnFlowMock({
      loan: {
        id: 'L-1',
        status: 'returned',
        due_at: new Date().toISOString(),
        book_id: BID,
        member_id: MID,
      },
      book: { stock_available: 1, stock_total: 5 },
      capture: { bookUpdate: null, finesInserts: [] },
    });
    const supabase = (createClient as unknown as () => unknown)();
    const res = await returnLoan({ supabase, id: 'L-1', userId: 'U-ADMIN' });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('CONFLICT');
    expect(j.error.message).toBe('Sudah dikembalikan.');
  });

  it('RETURN-SINGLE-03 stok clamp dan denda konsisten di semua jalur', async () => {
    // Modular split: loans-return.ts kini facade re-export; clamp + fines insert
    // hidup di legacyReturn.ts (dipakai returnLoan saat RPC absent).
    const helperSrc = read('src/lib/legacyReturn.ts');
    expect(helperSrc, 'RED: helper must own Math.min stock clamp').toContain('Math.min');
    expect(helperSrc, 'RED: helper must own fines insert').toMatch(/from\(['"]fines['"]\)/);
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    const due = new Date();
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() - 5);
    const capture = {
      bookUpdate: null as Record<string, unknown> | null,
      finesInserts: [] as unknown[],
    };
    setReturnFlowMock({
      loan: {
        id: 'L-2',
        status: 'borrowed',
        due_at: due.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      book: { stock_available: 5, stock_total: 5 },
      capture,
    });
    const supabase = (createClient as unknown as () => unknown)();
    const res = await returnLoan({ supabase, id: 'L-2', userId: 'U-ADMIN' });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { fine_amount: number } };
    expect(j.data.fine_amount).toBe(5000);
    const nextAvail = (capture.bookUpdate as { stock_available: number } | null)?.stock_available;
    expect(nextAvail, 'RED: stock_available must clamp to stock_total').toBeLessThanOrEqual(5);
    expect(nextAvail).toBe(5);
    expect(capture.finesInserts.length).toBe(1);
    expect((capture.finesInserts[0] as { amount: number }).amount).toBe(5000);
  });

  it('RETURN-SINGLE-04 UI peminjaman dan fastlane tidak regresi', () => {
    const ui = read('src/app/admin/peminjaman/page.tsx');
    const dash = read('src/app/admin/page.tsx');
    expect(ui, 'RED: peminjaman must keep PUT return').toMatch(/method:\s*['"]PUT['"]/);
    expect(ui, 'RED: peminjaman must keep action return').toMatch(/action.*return/);
    expect(ui, 'RED: peminjaman must keep <Modal').toContain('<Modal');
    expect(dash, 'RED: dashboard must keep overdue deep-link').toContain(
      '/admin/peminjaman?overdue=1'
    );
    expect(dash, 'RED: dashboard must keep empty state').toContain('Belum ada keterlambatan.');
  });
});
