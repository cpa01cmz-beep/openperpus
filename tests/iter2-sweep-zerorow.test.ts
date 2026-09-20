import { describe, expect, it, vi } from 'vitest';

// Iterasi-2: sweep paralel terbatas + 0-row legacy -> 409 (bukan 500).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { sweepExpiredReservations } from '@/lib/reservation-sweep';

function sweepFetch(delayMs = 30) {
  let inflight = 0;
  let maxInflight = 0;
  const fn = vi.fn(async () => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((r) => setTimeout(r, delayMs));
    inflight -= 1;
    return { ok: true, status: 200, json: async () => ({ data: {} }) };
  });
  return { fn: fn as unknown as typeof fetch, max: () => maxInflight };
}

describe('Iterasi-2 sweep + 0-row guards', () => {
  it('SWEEP-01 10 kandidat selesai paralel (max inflight > 1, hasil 10 sukses)', async () => {
    const { fn, max } = sweepFetch(30);
    const candidates = Array.from({ length: 10 }, (_, i) => ({ id: `c-${i}` }));
    const res = await sweepExpiredReservations({ fetchLike: fn, isStaff: true }, { candidates });
    expect(res.succeeded).toBe(10);
    expect(res.failed).toBe(0);
    expect(max(), 'sweep harus paralel, bukan serial 1-per-1').toBeGreaterThan(1);
    expect(max(), 'konkuren harus dibatasi').toBeLessThanOrEqual(5);
  });

  it('RACE-05 return 0-row real (PGRST116, tanpa pesan mock) -> 409 bukan 500', async () => {
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    let calls = 0;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.update = () => chain;
    chain.single = async () => {
      calls += 1;
      if (calls === 1) return { data: { fine_per_day: 1000 }, error: null };
      if (calls === 2)
        return {
          data: {
            id: 'L-x',
            status: 'borrowed',
            due_at: new Date().toISOString(),
            book_id: '22222222-2222-4222-8222-222222222222',
            member_id: '11111111-1111-4111-8111-111111111111',
          },
          error: null,
        };
      return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
    };
    const from = vi.fn(() => chain);
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from };
    const supabase = (createClient as unknown as () => unknown)();
    const res = await returnLoan({ supabase, id: 'L-x', userId: 'U-1' });
    expect(res.status).toBe(409);
  });

  it('RACE-06 extend 0-row real -> 409 bukan 500', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    let calls = 0;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = () => chain;
    chain.single = async () => {
      calls += 1;
      if (calls === 1)
        return {
          data: { id: 'L-y', status: 'borrowed', due_at: new Date().toISOString() },
          error: null,
        };
      return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
    };
    const from = vi.fn(() => chain);
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from };
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-y', userId: 'U-1', days: 7 });
    expect(res.status).toBe(409);
  });
});
