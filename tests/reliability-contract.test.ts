import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-reliability: JSON error contract {code,message} for
// loans / return / reservations / fines-pay (404/422/409).
// Handler tests use exact code match (toBe), not string-contains.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { jsonError } from '@/lib/supabase/auth';
import { POST as LOANS_POST } from '@/app/api/loans/route';
import { POST as RETURN_POST } from '@/app/api/loans/[id]/return/route';
import { POST as RES_POST } from '@/app/api/reservations/route';
import { POST as PAY_POST } from '@/app/api/fines/[id]/pay/route';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function postReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type MockSupabase = Record<string, unknown>;

function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function staffAuth(role = 'admin') {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }),
        };
      if (table === 'members')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: MID, status: 'active' }, error: null }),
            }),
          }),
        };
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }),
  };
}

// --- loans POST mock (requireStaff + members + rpc) ---
function setLoansMock(rpcError: { code: string; message: string } | null) {
  const base = staffAuth('admin') as MockSupabase & {
    from: ReturnType<typeof vi.fn>;
    rpc?: unknown;
  };
  const fromOrig = base.from as ReturnType<typeof vi.fn>;
  const from = vi.fn((table: string) => {
    if (table === 'profiles' || table === 'members')
      return (fromOrig as (t: string) => unknown)(table);
    if (table === 'loans') {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.in = () => c;
      c.gt = () => c;
      c.limit = async () => ({ data: [], error: null });
      c.single = async () => ({ data: null, error: null });
      return c;
    }
    return {
      select: () => ({
        eq: () => ({
          gt: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
          single: async () => ({ data: null, error: null }),
        }),
      }),
    };
  });
  setGlobal({
    ...(base as object),
    from,
    rpc: async (fn: string) => {
      if (fn === 'checkout_loan') {
        if (rpcError) return { data: null, error: rpcError };
        return { data: { id: 'loan-1' }, error: null };
      }
      return { data: null, error: { code: '42883', message: 'function missing' } };
    },
  });
}

// --- return POST mock ---
function setReturnMock(loan: Record<string, unknown> | null) {
  const base = staffAuth('admin') as MockSupabase;
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
    if (table === 'loans')
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: loan, error: null }) }) }),
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({ ...(base as object), from });
}

// --- reservations POST mocks ---
function setResMockInvalid() {
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-M1' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role: 'member' }, error: null }) }),
          }),
        };
      if (table === 'members')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: MID }, error: null }) }),
          }),
        };
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    }),
  });
}

function setResMockDuplicate() {
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-M1' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role: 'member' }, error: null }) }),
          }),
        };
      if (table === 'members') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = async () => ({ data: { id: MID, status: 'active' }, error: null });
        chain.maybeSingle = async () => ({ data: { id: MID }, error: null });
        return chain;
      }
      if (table === 'books')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: BID, is_active: true }, error: null }),
            }),
          }),
        };
      if (table === 'reservations')
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value' },
              }),
            }),
          }),
        };
      return { insert: async () => ({ error: null }) };
    }),
  });
}

// --- fines pay mock ---
function setPayMock(fine: Record<string, unknown>) {
  const db: Record<string, Record<string, unknown>> = { 'F-1': { ...fine, id: 'F-1' } };
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-LIB' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: 'librarian' }, error: null }),
              single: async () => ({ data: { role: 'librarian' }, error: null }),
            }),
          }),
        };
      if (table === 'members')
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: MID }, error: null }),
              single: async () => ({ data: { id: MID }, error: null }),
            }),
          }),
        };
      if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
      const chain: Record<string, unknown> = {};
      let idFilter: string | null = null;
      let isUpdate = false;
      let payload: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        if (col === 'id' && typeof val === 'string') idFilter = val;
        return chain;
      };
      chain.in = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        payload = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) {
          const cur = idFilter ? db[idFilter] : null;
          if (!cur) return { data: null, error: { message: 'not found' } };
          if (cur['status'] !== 'unpaid' && cur['status'] !== 'partial')
            return { data: null, error: { message: 'conflict' } };
          const updated = { ...cur, ...(payload ?? {}) };
          if (idFilter) db[idFilter] = updated;
          return { data: updated, error: null };
        }
        if (idFilter) return { data: db[idFilter] ?? null, error: null };
        return { data: null, error: null };
      };
      chain.maybeSingle = chain.single;
      return chain;
    }),
  });
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('S-reliability error contract {code,message}', () => {
  it('auth jsonError keeps {error:{code,message}} shape', async () => {
    const res = jsonError('NOT_FOUND', 'Tidak ditemukan.', 404);
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('NOT_FOUND');
    expect(j.error.message).toBe('Tidak ditemukan.');
  });

  it('loans POST invalid UUID -> 422 VALIDATION exact', async () => {
    setLoansMock(null);
    const res = await LOANS_POST(
      postReq('http://localhost/api/loans', { member_id: 'bad', book_id: 'bad' })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(typeof j.error.message).toBe('string');
  });

  it('loans POST rpc 25000 generic msg -> 409 CONFLICT exact (no fragile contains)', async () => {
    setLoansMock({ code: '25000', message: 'stock exhausted' });
    const res = await LOANS_POST(
      postReq('http://localhost/api/loans', { member_id: MID, book_id: BID })
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('CONFLICT');
    expect(j.error.message).toBe('Stok buku habis.');
  });

  it('loans POST rpc 02000 generic msg -> 404 NOT_FOUND exact', async () => {
    setLoansMock({ code: '02000', message: 'no such row' });
    const res = await LOANS_POST(
      postReq('http://localhost/api/loans', { member_id: MID, book_id: BID })
    );
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('NOT_FOUND');
  });

  it('return POST missing loan -> 404 NOT_FOUND exact', async () => {
    setReturnMock(null);
    const res = await RETURN_POST(postReq('http://localhost/api/loans/L-1/return', {}), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('NOT_FOUND');
  });

  it('return POST already returned -> 409 CONFLICT exact', async () => {
    setReturnMock({
      id: 'L-1',
      status: 'returned',
      due_at: new Date().toISOString(),
      book_id: BID,
      member_id: MID,
    });
    const res = await RETURN_POST(postReq('http://localhost/api/loans/L-1/return', {}), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('CONFLICT');
  });

  it('reservations POST invalid book_id -> 422 VALIDATION exact', async () => {
    setResMockInvalid();
    const res = await RES_POST(postReq('http://localhost/api/reservations', { book_id: 'bad' }));
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('VALIDATION');
  });

  it('reservations POST duplicate 23505 -> 409 CONFLICT exact', async () => {
    setResMockDuplicate();
    const res = await RES_POST(postReq('http://localhost/api/reservations', { book_id: BID }));
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('CONFLICT');
  });

  it('fines pay already paid -> 409 CONFLICT exact', async () => {
    setPayMock({ member_id: MID, loan_id: 'L-1', amount: 5000, paid_amount: 5000, status: 'paid' });
    const res = await PAY_POST(postReq('http://localhost/api/fines/F-1/pay', { method: 'cash' }), {
      params: { id: 'F-1' },
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('CONFLICT');
  });

  it('fines pay overpay -> 422 VALIDATION exact code', async () => {
    setPayMock({
      member_id: MID,
      loan_id: 'L-1',
      amount: 5000,
      paid_amount: 2000,
      status: 'partial',
    });
    const res = await PAY_POST(
      postReq('http://localhost/api/fines/F-1/pay', { method: 'qris', amount: 5000 }),
      { params: { id: 'F-1' } }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('Nominal melebihi sisa denda (3000).');
  });

  it('S-REL loans uses exact rpc codes 25000/02000/22000 (not fragile contains)', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(
      src.includes("rpcCode === '25000'"),
      'S-REL RED: loans must match rpcCode 25000 exactly'
    ).toBe(true);
    expect(
      src.includes("rpcCode === '02000'"),
      'S-REL RED: loans must match rpcCode 02000 exactly'
    ).toBe(true);
    expect(
      src.includes("rpcCode === '22000'"),
      'S-REL RED: loans must match rpcCode 22000 exactly'
    ).toBe(true);
  });
});
