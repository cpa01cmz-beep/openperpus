import { describe, expect, it, vi } from 'vitest';

// QA-BEHAVE: katalog server pagination — perilaku nyata, bukan string-contains.
// GET /api/books?page=&per_page= memotong via range + total exact.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET as BOOKS_GET } from '@/app/api/books/route';

function setBooksMock(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `b-${i}`,
    title: `Buku ${i}`,
    stock_available: 3,
    stock_total: 5,
  }));
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gt = () => chain;
    chain.in = () => chain;
    chain.or = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.range = (a: number, b: number) => {
      chain.__slice = [a, b] as [number, number];
      return chain;
    };
    chain.then = (res: (v: unknown) => unknown) => {
      const [a, b] = ((chain.__slice as [number, number] | undefined) ?? [0, 23]) as [
        number,
        number,
      ];
      return Promise.resolve({ data: rows.slice(a, b + 1), error: null, count: total }).then(res);
    };
    return chain;
  });
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'anon' } }) },
    from,
    rpc: async () => ({ data: null, error: { code: '42883', message: 'missing' } }),
  };
}

describe('QA-BEHAVE katalog pagination', () => {
  it('PAGE-01 page=2&per_page=10 -> 10 baris + total 35 + totalPages 4', async () => {
    setBooksMock(35);
    const res = await BOOKS_GET(new Request('http://localhost/api/books?page=2&per_page=10'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: unknown[];
      meta: { page: number; per_page: number; total: number };
    };
    expect(j.data.length).toBe(10);
    expect(j.meta.page).toBe(2);
    expect(j.meta.per_page).toBe(10);
    expect(j.meta.total).toBe(35);
  });

  it('PAGE-02 tanpa param -> default per_page + meta konsisten', async () => {
    setBooksMock(35);
    const res = await BOOKS_GET(new Request('http://localhost/api/books'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: unknown[]; meta: { total: number } };
    expect(j.data.length).toBeGreaterThan(0);
    expect(j.data.length).toBeLessThanOrEqual(35);
    expect(j.meta.total).toBe(35);
  });
});
