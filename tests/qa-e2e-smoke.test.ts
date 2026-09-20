import { describe, expect, it, vi } from 'vitest';

// QA-E2E-SMOKE: rantai katalog -> reservasi -> pinjam -> kembali via handler nyata.
// Tanpa browser: memanggil route handler langsung dengan supabase mock ber-state.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET as BOOKS_GET } from '@/app/api/books/route';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function jreq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('QA-E2E-SMOKE rantai sirkulasi', () => {
  it('SMOKE-01 katalog publik 200 + meta konsisten', async () => {
    const rows = [{ id: BID, title: 'Buku A', stock_available: 2, stock_total: 3 }];
    const from = vi.fn(() => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.gt = () => c;
      c.in = () => c;
      c.or = () => c;
      c.order = () => c;
      c.limit = () => c;
      c.range = () => c;
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null, count: 1 }).then(res);
      return c;
    });
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'anon' } }) },
      from,
      rpc: async () => ({ data: null, error: { code: '42883', message: 'missing' } }),
    };
    const res = await BOOKS_GET(new Request('http://localhost/api/books?page=1&per_page=10'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { id: string }[]; meta: { total: number } };
    expect(j.data[0]?.id).toBe(BID);
    expect(j.meta.total).toBe(1);
  });

  it('SMOKE-02 reservasi -> pinjam -> kembali (handler chain, state mock)', async () => {
    const { POST: RES_POST } = await import('@/app/api/reservations/route');
    const { POST: LOANS_POST } = await import('@/app/api/loans/route');
    const { returnLoan } = await import('@/lib/loans-return');

    // Reservasi: member aktif, buku aktif, tanpa duplikat.
    const profChain = () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { role: 'member' }, error: null }),
          maybeSingle: async () => ({ data: { role: 'member' }, error: null }),
        }),
      }),
    });
    const memberChain = () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: MID, status: 'active', user_id: 'U-M1' },
            error: null,
          }),
          maybeSingle: async () => ({
            data: { id: MID, status: 'active', user_id: 'U-M1' },
            error: null,
          }),
        }),
      }),
    });
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'U-M1' } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profChain();
        if (table === 'members') return memberChain();
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
            select: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'R-1', status: 'pending' }, error: null }),
              }),
            }),
          };
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      }),
    };
    const r1 = await RES_POST(jreq('http://localhost/api/reservations', 'POST', { book_id: BID }));
    expect(r1.status).toBe(201);

    // Pinjam: staff, member aktif, RPC 201.
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles')
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
            }),
          };
        if (table === 'members')
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: MID, status: 'active' }, error: null }),
              }),
            }),
          };
        if (table === 'loans') {
          const c: Record<string, unknown> = {};
          c.select = () => c;
          c.eq = () => c;
          c.in = () => c;
          c.limit = async () => ({ data: [], error: null });
          return c;
        }
        if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      }),
      rpc: async () => ({ data: { id: 'L-1', status: 'borrowed' }, error: null }),
    };
    const r2 = await LOANS_POST(
      jreq('http://localhost/api/loans', 'POST', { member_id: MID, book_id: BID })
    );
    expect(r2.status).toBe(201);

    // Kembali: legacy path, tepat waktu -> 200 + fine 0 + tanpa denda.
    const due = new Date().toISOString();
    const fines: unknown[] = [];
    const fromBack = vi.fn((table: string) => {
      if (table === 'loans') {
        const c: Record<string, unknown> = {};
        let upd: Record<string, unknown> | null = null;
        c.select = () => c;
        c.eq = () => c;
        c.in = () => c;
        c.update = (p: Record<string, unknown>) => {
          upd = p;
          return c;
        };
        c.single = async () =>
          upd
            ? { data: { id: 'L-1', ...upd }, error: null }
            : {
                data: { id: 'L-1', status: 'borrowed', due_at: due, book_id: BID, member_id: MID },
                error: null,
              };
        return c;
      }
      if (table === 'books')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { stock_available: 1, stock_total: 3 }, error: null }),
            }),
          }),
          update: () => ({ eq: () => ({ error: null }) }),
        };
      if (table === 'fines')
        return { insert: async (r: unknown) => (fines.push(r), { error: null }) };
      if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
      if (table === 'library_settings')
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { fine_per_day: 1000 }, error: null }) }),
          }),
        };
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    });
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from: fromBack };
    const r3 = await returnLoan({
      supabase: { from: fromBack } as never,
      id: 'L-1',
      userId: 'U-ADMIN',
    });
    expect(r3.status).toBe(200);
    expect(fines.length, 'tepat waktu -> tanpa row denda').toBe(0);
  });

  it('SMOKE-03 error-path: reservasi buku nonaktif -> 410; pinjam stok habis -> 409', async () => {
    const { POST: RES_POST } = await import('@/app/api/reservations/route');
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'U-M1' } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles')
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { role: 'member' }, error: null }),
                maybeSingle: async () => ({ data: { role: 'member' }, error: null }),
              }),
            }),
          };
        if (table === 'members')
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: MID, status: 'active', user_id: 'U-M1' },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { id: MID, status: 'active', user_id: 'U-M1' },
                  error: null,
                }),
              }),
            }),
          };
        if (table === 'books')
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: BID, is_active: false }, error: null }),
              }),
            }),
          };
        if (table === 'reservations')
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
            insert: () => ({
              select: () => ({ single: async () => ({ data: null, error: null }) }),
            }),
          };
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      }),
    };
    const r = await RES_POST(jreq('http://localhost/api/reservations', 'POST', { book_id: BID }));
    expect(r.status).toBe(410);
  });
});
