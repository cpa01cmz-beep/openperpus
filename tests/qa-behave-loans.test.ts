import { describe, expect, it, vi } from 'vitest';

// QA-BEHAVE: loans atomic checkout + calcFine boundary — perilaku nyata.
// RPC sukses -> 201; RPC stok-habis -> 409; calcFine batas tepat-waktu/telat.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as LOANS_POST } from '@/app/api/loans/route';
import { calcFine } from '@/lib/supabase/auth';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function postReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/loans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setCheckoutMock(rpc: () => Promise<unknown>) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
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
      c.limit = async () => ({ data: [], error: null });
      return c;
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
    rpc,
  };
}

describe('QA-BEHAVE loans atomic + fine boundary', () => {
  it('LOAN-01 RPC sukses -> 201 + data loan', async () => {
    setCheckoutMock(async () => ({ data: { id: 'L-1', status: 'borrowed' }, error: null }));
    const res = await LOANS_POST(postReq({ member_id: MID, book_id: BID }));
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { id: string } };
    expect(j.data.id).toBe('L-1');
  });

  it('LOAN-02 RPC stok habis (25000) -> 409 tanpa fallback insert', async () => {
    setCheckoutMock(async () => ({
      data: null,
      error: { code: '25000', message: 'Stok buku habis.' },
    }));
    const res = await LOANS_POST(postReq({ member_id: MID, book_id: BID }));
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('CONFLICT');
  });

  it('FINE-01 calcFine: tepat waktu 0, 5 hari telat 5000, 1 hari telat 1000', () => {
    expect(calcFine('2026-01-01', '2026-01-01')).toBe(0);
    expect(calcFine('2026-01-01', '2026-01-06')).toBe(5000);
    expect(calcFine('2026-01-01', '2026-01-02')).toBe(1000);
  });

  it('FINE-02 calcFine: kembali sebelum due -> 0 (tanpa negatif)', () => {
    expect(calcFine('2026-01-10', '2026-01-01')).toBe(0);
  });
});
