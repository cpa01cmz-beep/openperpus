import { describe, expect, it, vi } from 'vitest';

// Core-Data2 race guards — RED first.
// Guards: return/extend conditional writes (0-row -> 409), Invalid Date 422,
// returnedAt-future 422, fines pay_own_fine RPC attempt + paid_amount CAS,
// loans notes trim/cap, checkout idempotency-key note.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function loanDb(loan: Record<string, unknown>, opts: { updateWins?: boolean } = {}) {
  const { updateWins = true } = opts;
  const from = vi.fn((table: string) => {
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      let isUpdate = false;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        payload = p;
        isUpdate = true;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) {
          if (!updateWins) return { data: null, error: { message: 'concurrent winner' } };
          return { data: { ...loan, ...(payload ?? {}) }, error: null };
        }
        return { data: loan, error: null };
      };
      return chain;
    }
    if (table === 'books') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { stock_available: 1, stock_total: 5 },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
      };
    }
    if (table === 'fines') {
      return { insert: async () => ({ error: null }) };
    }
    if (table === 'activity_logs') {
      return { insert: async () => ({ error: null }) };
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-1' } }, error: null }) },
    from,
  });
}

describe('Core-Data2 race guards', () => {
  it('RACE-01 return konkuren kalah conditional-write -> 409', async () => {
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    loanDb(
      {
        id: 'L-1',
        status: 'borrowed',
        due_at: new Date().toISOString(),
        book_id: BID,
        member_id: MID,
      },
      { updateWins: false }
    );
    const supabase = (createClient as unknown as () => unknown)();
    const res = await returnLoan({ supabase, id: 'L-1', userId: 'U-1' });
    expect(res.status).toBe(409);
  });

  it('RACE-02 extend lost-update -> 409 via conditional due_at', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    loanDb(
      {
        id: 'L-2',
        status: 'borrowed',
        due_at: new Date('2026-02-10T00:00:00.000Z').toISOString(),
        book_id: BID,
        member_id: MID,
      },
      { updateWins: false }
    );
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-2', userId: 'U-1', days: 7 });
    expect(res.status).toBe(409);
  });

  it('RACE-03 Invalid due_at -> 422 sebelum aritmetika', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    loanDb({
      id: 'L-3',
      status: 'borrowed',
      due_at: 'bukan-tanggal',
      book_id: BID,
      member_id: MID,
    });
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-3', userId: 'U-1', days: 7 });
    expect(res.status).toBe(422);
  });

  it('RACE-04 returnedAt masa depan -> 422', async () => {
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    loanDb({
      id: 'L-4',
      status: 'borrowed',
      due_at: new Date().toISOString(),
      book_id: BID,
      member_id: MID,
    });
    const supabase = (createClient as unknown as () => unknown)();
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await returnLoan({ supabase, id: 'L-4', userId: 'U-1', returnedAt: future });
    expect(res.status).toBe(422);
  });
});
