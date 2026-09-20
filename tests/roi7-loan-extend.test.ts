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
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
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
});
