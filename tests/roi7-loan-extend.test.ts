import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi7 Perpanjang pinjaman 1-klik — RED first.
// Extend button beside Kembalikan; PUT /api/loans action:extend {days}
// sets due_at += N days, audit loans.extend. Single-source in loans-return.ts.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const BID = '22222222-2222-4222-8222-222222222222';
const MID = '11111111-1111-4111-8111-111111111111';

type MockSupabase = Record<string, unknown>;
function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function setExtendFlowMock(opts: { loan: Record<string, unknown>; audit: unknown[] }) {
  const { loan, audit } = opts;
  const from = vi.fn((table: string) => {
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      let payload: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.eq = () => chain;
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
    if (table === 'activity_logs') {
      return {
        insert: async (row: unknown) => {
          audit.push(row);
          return { error: null };
        },
      };
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });

  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    if (fn === 'extend_loan') {
      const { p_loan_id, p_days } = params as { p_loan_id: string; p_days: number };
      if (p_loan_id === loan.id) {
        // Check for returned/lost status - should return 409
        if (loan.status === 'returned' || loan.status === 'lost') {
          return {
            data: null,
            error: { code: '40901', message: 'Peminjaman sudah selesai, tidak bisa diperpanjang' },
          };
        }
        const dueAt = String(loan.due_at);
        const newDue = new Date(new Date(dueAt).getTime() + p_days * 86400000);
        const isOverdue = newDue.getTime() < Date.now();
        return {
          data: [{ ...loan, due_at: newDue.toISOString(), is_overdue: isOverdue }],
          error: null,
        };
      }
      return { data: null, error: { code: 'P0001', message: 'Peminjaman tidak ditemukan' } };
    }
    return { data: null, error: { code: '42883', message: 'function not found' } };
  });

  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
    rpc,
  });
}

describe('S-roi7 extend loan 1-klik', () => {
  it('EXTEND-01 helper single-source: extendLoan diekspor dari loans-return.ts', async () => {
    const mod = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: unknown;
    };
    expect(typeof mod.extendLoan, 'RED: src/lib/loans-return.ts must export extendLoan').toBe(
      'function'
    );
  });

  it('EXTEND-02 extend active loan menggeser due_at, status tetap borrowed + audit loans.extend', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    const due = new Date('2026-02-10T00:00:00.000Z');
    const audit: unknown[] = [];
    setExtendFlowMock({
      loan: {
        id: 'L-1',
        status: 'borrowed',
        due_at: due.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      audit,
    });
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-1', userId: 'U-ADMIN', days: 7 });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { due_at: string; status: string } };
    const newDue = new Date(j.data.due_at).getTime();
    expect(newDue - due.getTime(), 'RED: due_at must shift +7 days').toBe(7 * 86400000);
    expect(j.data.status).toBe('borrowed');
    expect(
      audit.some((r) => (r as { action: string }).action === 'loans.extend'),
      'RED: must audit loans.extend'
    ).toBe(true);
    const meta = (
      audit.find((r) => (r as { action: string }).action === 'loans.extend') as {
        metadata: { old_due_at: string; new_due_at: string };
      }
    ).metadata;
    expect(meta.old_due_at).toBe(due.toISOString());
    expect(meta.new_due_at).toBe(j.data.due_at);
  });

  it('EXTEND-03 extend overdue clears is_overdue; extend returned → 409', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    // overdue: due 30 hari lalu, extend 60 hari -> due di masa depan
    const pastDue = new Date(Date.now() - 30 * 86400000).toISOString();
    const audit: unknown[] = [];
    setExtendFlowMock({
      loan: { id: 'L-2', status: 'overdue', due_at: pastDue, book_id: BID, member_id: MID },
      audit,
    });
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-2', userId: 'U-ADMIN', days: 60 });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { due_at: string; is_overdue?: boolean } };
    expect(new Date(j.data.due_at).getTime() > Date.now()).toBe(true);
    expect(j.data.is_overdue ?? false, 'RED: extend overdue must clear is_overdue').toBe(false);

    // returned -> 409
    const audit2: unknown[] = [];
    setExtendFlowMock({
      loan: {
        id: 'L-3',
        status: 'returned',
        due_at: pastDue,
        book_id: BID,
        member_id: MID,
      },
      audit: audit2,
    });
    const supabase2 = (createClient as unknown as () => unknown)();
    const res2 = await extendLoan({ supabase: supabase2, id: 'L-3', userId: 'U-ADMIN', days: 7 });
    expect(res2.status).toBe(409);
    const j2 = (await res2.json()) as { error: { code: string } };
    expect(j2.error.code).toBe('CONFLICT');
  });

  it('EXTEND-04 route kolektif + alias menerima action:extend; UI ada tombol Perpanjang', () => {
    const collective = read('src/app/api/loans/route.ts');
    const alias = read('src/app/api/loans/[id]/route.ts');
    expect(collective, 'RED: collective PUT must handle action extend').toMatch(/extend/);
    expect(alias, 'RED: alias PUT must handle action extend').toMatch(/extend/);
    const ui = read('src/app/admin/peminjaman/page.tsx');
    expect(ui, 'RED: peminjaman must have Perpanjang button').toMatch(/Perpanjang/);
    expect(ui, 'RED: Perpanjang must sit beside Kembalikan').toContain('Kembalikan');
  });

  // --- RPC tests (RED: will fail until migration 0018 applied + extendLoan rewritten) ---

  it('EXTEND-RPC-01: extend_loan RPC validates days 1..90', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');

    const due = new Date('2026-02-10T00:00:00.000Z');
    const audit: unknown[] = [];
    setExtendFlowMock({
      loan: {
        id: 'L-RPC-1',
        status: 'borrowed',
        due_at: due.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      audit,
    });
    const supabase = (createClient as unknown as () => unknown)();

    // days = 0 -> 422
    const r0 = await extendLoan({ supabase, id: 'L-RPC-1', userId: 'U-ADMIN', days: 0 });
    expect(r0.status, 'days=0 must be 422').toBe(422);
    const j0 = (await r0.json()) as { error: { code: string } };
    expect(j0.error.code).toBe('VALIDATION');

    // days = 91 -> 422
    const r91 = await extendLoan({ supabase, id: 'L-RPC-1', userId: 'U-ADMIN', days: 91 });
    expect(r91.status, 'days=91 must be 422').toBe(422);
    const j91 = (await r91.json()) as { error: { code: string } };
    expect(j91.error.code).toBe('VALIDATION');

    // days = 1.5 -> 422
    const r15 = await extendLoan({ supabase, id: 'L-RPC-1', userId: 'U-ADMIN', days: 1.5 });
    expect(r15.status, 'days=1.5 must be 422').toBe(422);
  });

  it('EXTEND-RPC-02: extend_loan RPC returns 409 for returned/lost', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (args: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');

    const pastDue = new Date(Date.now() - 30 * 86400000).toISOString();

    // returned -> 409
    const audit1: unknown[] = [];
    setExtendFlowMock({
      loan: {
        id: 'L-RPC-2',
        status: 'returned',
        due_at: pastDue,
        book_id: BID,
        member_id: MID,
      },
      audit: audit1,
    });
    const s1 = (createClient as unknown as () => unknown)();
    const res1 = await extendLoan({ supabase: s1, id: 'L-RPC-2', userId: 'U-ADMIN', days: 7 });
    expect(res1.status, 'returned must be 409').toBe(409);
    const j1 = (await res1.json()) as { error: { code: string } };
    expect(j1.error.code).toBe('CONFLICT');

    // lost -> 409
    const audit2: unknown[] = [];
    setExtendFlowMock({
      loan: {
        id: 'L-RPC-3',
        status: 'lost',
        due_at: pastDue,
        book_id: BID,
        member_id: MID,
      },
      audit: audit2,
    });
    const s2 = (createClient as unknown as () => unknown)();
    const res2 = await extendLoan({ supabase: s2, id: 'L-RPC-3', userId: 'U-ADMIN', days: 7 });
    expect(res2.status, 'lost must be 409').toBe(409);
    const j2 = (await res2.json()) as { error: { code: string } };
    expect(j2.error.code).toBe('CONFLICT');
  });

  it('EXTEND-RPC-03: extendLoan calls RPC first, falls back on 42883/PGRST202', async () => {
    // This test verifies the new implementation pattern.
    // The actual mock behavior for RPC fallback is implementation-dependent.
    // We verify the code path exists by checking the source.
    const src = read('src/lib/extendLoan.ts');
    expect(src).toMatch(/\.rpc\(['"]extend_loan['"]/);
    expect(src).toMatch(/42883|PGRST202/);
    expect(src).toMatch(/fallback|optimistic-lock|catch/);
  });
});
