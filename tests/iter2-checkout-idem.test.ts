import { describe, expect, it, vi } from 'vitest';

// Iterasi-2 Business: checkout idempotency — double POST pasangan sama -> 409 kedua.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as LOANS_POST } from '@/app/api/loans/route';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function postReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/loans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setLoansMock(opts: { activeLoans: { id: string }[] }) {
  const rpcCalls: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: 'admin' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: MID, status: 'active' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'loans') {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.in = () => c;
      c.limit = async () => ({ data: opts.activeLoans, error: null });
      return c;
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
    rpc: async (...a: unknown[]) => {
      rpcCalls.push(a);
      return { data: { id: 'L-1' }, error: null };
    },
  };
  return { rpcCalls };
}

describe('Iterasi-2 checkout idempotency', () => {
  it('IDEM-01 double POST pasangan (buku, anggota) sama -> kedua 409', async () => {
    setLoansMock({ activeLoans: [] });
    const first = await LOANS_POST(postReq({ member_id: MID, book_id: BID, notes: '  pinjam  ' }));
    expect(first.status).toBe(201);
    // Simulasi loan aktif terbentuk setelah POST pertama.
    setLoansMock({ activeLoans: [{ id: 'L-1' }] });
    const second = await LOANS_POST(postReq({ member_id: MID, book_id: BID }));
    expect(second.status).toBe(409);
    const j = (await second.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('CONFLICT');
    expect(j.error.message).toMatch(/sudah meminjam|loan aktif/i);
  });

  it('IDEM-02 notes di-trim sebelum insert (tanpa spasi liar)', async () => {
    const { rpcCalls } = setLoansMock({ activeLoans: [] });
    await LOANS_POST(postReq({ member_id: MID, book_id: BID, notes: '  pinjam  ' }));
    const args = rpcCalls[0] as [string, Record<string, unknown>];
    expect(args[0]).toBe('checkout_loan');
    expect(args[1].p_notes).toBe('pinjam');
  });
});
