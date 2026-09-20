import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi9 Stok opname massal — RED first.
// Checkbox select on buku rows + bulk stock adjust (reuse onBulkDelete
// 409-skip pattern). Bulk PUT validates stock_available<=stock_total per row,
// skips borrowed, audit books.stock_opname. Never negative.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function setOpnameMock(opts: {
  role?: string;
  userId?: string | null;
  books?: Record<string, { stock_total: number; stock_available: number }>;
  activeLoans?: { book_id: string }[];
  audit?: Record<string, unknown>[];
}) {
  const books = opts.books ?? {};
  const audit = opts.audit ?? [];
  const updates: Record<string, Record<string, unknown>> = {};
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: opts.role ?? 'admin' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'loans') {
      const c: Record<string, (...a: unknown[]) => unknown> = {};
      c.select = () => c;
      c.in = () => c;
      c.eq = () => c;
      (c as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: opts.activeLoans ?? [], error: null }).then(res);
      return c;
    }
    if (table === 'books') {
      const chain: Record<string, unknown> = {};
      let mode: 'select' | 'update' | null = null;
      let updPayload: Record<string, unknown> | null = null;
      let eqId: string | null = null;
      let inIds: string[] | null = null;
      chain.select = () => {
        mode = 'select';
        return chain;
      };
      chain.update = (p: Record<string, unknown>) => {
        mode = 'update';
        updPayload = p;
        return chain;
      };
      chain.eq = (_col: string, val: unknown) => {
        eqId = String(val);
        return chain;
      };
      chain.in = (_col: string, vals: unknown) => {
        inIds = vals as string[];
        return chain;
      };
      chain.upsert = (rows: unknown) => {
        for (const r of rows as { id: string }[]) updates[r.id] = r as Record<string, unknown>;
        return Promise.resolve({ data: rows, error: null });
      };
      chain.single = async () => {
        if (mode === 'update' && eqId) {
          updates[eqId] = updPayload ?? {};
          return { data: { id: eqId, ...(books[eqId] ?? {}), ...(updPayload ?? {}) }, error: null };
        }
        if (eqId) return { data: books[eqId] ? { id: eqId, ...books[eqId] } : null, error: null };
        return { data: null, error: null };
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) => {
        // direct-await pattern (update().eq() without .single()): record the update here
        if (mode === 'update' && eqId && updPayload) {
          updates[eqId] = updPayload;
        }
        const rows = (inIds ?? []).map((id) => ({ id, ...(books[id] ?? {}) }));
        return Promise.resolve({ data: rows, error: null }).then(res);
      };
      return chain;
    }
    if (table === 'activity_logs') {
      return {
        insert: async (p: Record<string, unknown>) => {
          audit.push(p);
          return { error: null };
        },
      };
    }
    return {};
  });
  setGlobal({
    auth: {
      getUser: async () =>
        opts.userId === null
          ? { data: { user: null }, error: { message: 'no session' } }
          : { data: { user: { id: opts.userId ?? 'U-ADMIN' } }, error: null },
    },
    from,
  });
  return { updates };
}

describe('S-roi9 stok opname massal', () => {
  it('OPNAME-01 5 buku terupdate + audit books.stock_opname per baris', async () => {
    const { PUT } = (await import('@/app/api/books/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
    };
    const audit: Record<string, unknown>[] = [];
    const books: Record<string, { stock_total: number; stock_available: number }> = {};
    for (const id of [A, B, C, D, E]) books[id] = { stock_total: 10, stock_available: 8 };
    const { updates } = setOpnameMock({ books, audit });
    const items = [A, B, C, D, E].map((id) => ({ id, stock_total: 12, stock_available: 9 }));
    const res = await PUT(putReq('http://localhost/api/books', { action: 'stock_opname', items }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { updated: string[]; skipped: { id: string; reason: string }[] };
    };
    expect(j.data.updated.sort(), 'RED: 5 books must update').toEqual([A, B, C, D, E].sort());
    expect(j.data.skipped).toEqual([]);
    expect(Object.keys(updates).sort()).toEqual([A, B, C, D, E].sort());
    const opnameAudits = audit.filter((r) => r.action === 'books.stock_opname');
    expect(opnameAudits.length, 'single bulk audit with ids metadata').toBe(1);
    expect(
      ((opnameAudits[0] as { metadata: { ids: string[] } }).metadata.ids ?? []).sort()
    ).toEqual([A, B, C, D, E].sort());
  });

  it('OPNAME-02 buku dipinjam dilewati dengan reason; baris invalid 422, lainnya tetap update', async () => {
    const { PUT } = (await import('@/app/api/books/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
    };
    const audit: Record<string, unknown>[] = [];
    const books: Record<string, { stock_total: number; stock_available: number }> = {
      [A]: { stock_total: 10, stock_available: 8 },
      [B]: { stock_total: 10, stock_available: 8 },
      [C]: { stock_total: 10, stock_available: 8 },
    };
    setOpnameMock({ books, audit, activeLoans: [{ book_id: B }] });
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [
          { id: A, stock_total: 12, stock_available: 9 },
          { id: B, stock_total: 12, stock_available: 9 },
          // invalid: available > total
          { id: C, stock_total: 5, stock_available: 9 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { updated: string[]; skipped: { id: string; reason: string }[] };
    };
    expect(j.data.updated, 'RED: A must update, others skipped').toEqual([A]);
    const skipIds = j.data.skipped.map((s) => s.id).sort();
    expect(skipIds).toEqual([B, C].sort());
    const skippedB = j.data.skipped.find((s) => s.id === B);
    expect(skippedB?.reason, 'RED: borrowed skip must carry reason').toMatch(/pinjam/i);
    const skippedC = j.data.skipped.find((s) => s.id === C);
    expect(skippedC?.reason, 'RED: invalid row must carry reason').toMatch(
      /melebihi|tidak valid|valid/i
    );
  });

  it('OPNAME-03 stok tidak pernah negatif', async () => {
    const { PUT } = (await import('@/app/api/books/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
    };
    const audit: Record<string, unknown>[] = [];
    setOpnameMock({
      books: { [A]: { stock_total: 10, stock_available: 8 } },
      audit,
    });
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 10, stock_available: -3 }],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { updated: string[]; skipped: { id: string; reason: string }[] };
    };
    expect(j.data.updated, 'RED: negative stock must not update').toEqual([]);
    expect(j.data.skipped.map((s) => s.id)).toEqual([A]);
  });

  it('OPNAME-04 UI buku: checkbox select + tombol stok opname massal (pola 409-skip)', () => {
    const ui = read('src/app/admin/buku/page.tsx');
    expect(ui, 'RED: buku page must keep checkbox select').toMatch(/checkbox/i);
    expect(ui, 'RED: buku page must have bulk stock-opname action').toMatch(
      /opname|Opname|stock_opname/i
    );
    expect(ui, 'RED: must reuse 409-skip pattern (dilewati)').toMatch(/dilewati|skipped/i);
  });
});
