import { describe, expect, it, vi, beforeEach } from 'vitest';

// Iterasi 2 Admin Flow & Tata Kelola:
// (1) bulk delete DELETE /api/books?id=1,2,3 (staff-only, audit tiap item,
//     lewati buku yang masih dipinjam);
// (2) sort ?sort=&order= di GET /api/banners (judul/created_at/sort_order).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { DELETE as BOOKS_BULK_DELETE } from '@/app/api/books/route';
import { GET as BANNERS_GET } from '@/app/api/banners/route';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function delReq(url: string) {
  return new Request(url, { method: 'DELETE' });
}

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function mockSupabase(opts: {
  role?: string;
  userId?: string | null;
  activeLoans?: { book_id: string }[];
  deleteError?: { message: string } | null;
}) {
  const auditCalls: Record<string, unknown>[] = [];
  const orderCalls: { col: string; asc: boolean }[] = [];
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
      const c: Record<string, (...a: unknown[]) => unknown> = {};
      c.delete = () => c;
      c.in = () => c;
      c.eq = () => c;
      (c as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ error: opts.deleteError ?? null }).then(res);
      return c;
    }
    if (table === 'activity_logs') {
      return {
        insert: async (p: Record<string, unknown>) => {
          auditCalls.push(p);
          return { error: null };
        },
      };
    }
    if (table === 'banners') {
      const c: Record<string, (...a: unknown[]) => unknown> = {};
      c.select = () => c;
      c.order = (col: unknown, o: unknown) => {
        orderCalls.push({
          col: String(col),
          asc: (o as { ascending: boolean }).ascending,
        });
        return c;
      };
      c.range = () => c;
      (c as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(res);
      return c;
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
  return { auditCalls, orderCalls };
}

type BulkBody = {
  data?: { deleted: string[]; skipped: string[] };
  error?: { code: string; message: string };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Iter2 bulk delete /api/books?id=1,2,3', () => {
  it('tanpa ?id= -> 400 VALIDATION', async () => {
    mockSupabase({});
    const res = await BOOKS_BULK_DELETE(delReq('http://localhost/api/books'));
    expect(res.status).toBe(400);
    const j = (await res.json()) as BulkBody;
    expect(j.error?.code).toBe('VALIDATION');
  });

  it('tanpa login -> 401 UNAUTHORIZED', async () => {
    mockSupabase({ userId: null });
    const res = await BOOKS_BULK_DELETE(delReq(`http://localhost/api/books?id=${A}`));
    expect(res.status).toBe(401);
    const j = (await res.json()) as BulkBody;
    expect(j.error?.code).toBe('UNAUTHORIZED');
  });

  it('hapus semua + audit tiap item (books.delete)', async () => {
    const { auditCalls } = mockSupabase({});
    const res = await BOOKS_BULK_DELETE(delReq(`http://localhost/api/books?id=${A},${B}`));
    expect(res.status).toBe(200);
    const j = (await res.json()) as BulkBody;
    expect(j.data?.deleted).toEqual([A, B]);
    expect(j.data?.skipped).toEqual([]);
    expect(auditCalls.length).toBe(2);
    expect(auditCalls.every((p) => p.action === 'books.delete')).toBe(true);
  });

  it('lewati buku yang masih dipinjam (skipped), audit hanya yang terhapus', async () => {
    const { auditCalls } = mockSupabase({ activeLoans: [{ book_id: B }] });
    const res = await BOOKS_BULK_DELETE(delReq(`http://localhost/api/books?id=${A},${B}`));
    expect(res.status).toBe(200);
    const j = (await res.json()) as BulkBody;
    expect(j.data?.deleted).toEqual([A]);
    expect(j.data?.skipped).toEqual([B]);
    expect(auditCalls.length).toBe(1);
  });
});

describe('Iter2 sort GET /api/banners?sort=&order=', () => {
  it('sort=title&order=desc -> order title descending', async () => {
    const { orderCalls } = mockSupabase({});
    const res = await BANNERS_GET(
      new Request('http://localhost/api/banners?sort=title&order=desc')
    );
    expect(res.status).toBe(200);
    expect(orderCalls[0]).toEqual({ col: 'title', asc: false });
  });

  it('sort=created_at tanpa order -> default descending', async () => {
    const { orderCalls } = mockSupabase({});
    const res = await BANNERS_GET(new Request('http://localhost/api/banners?sort=created_at'));
    expect(res.status).toBe(200);
    expect(orderCalls[0]).toEqual({ col: 'created_at', asc: false });
  });

  it('sort ngawur -> fallback sort_order asc', async () => {
    const { orderCalls } = mockSupabase({});
    const res = await BANNERS_GET(new Request('http://localhost/api/banners?sort=hacked'));
    expect(res.status).toBe(200);
    expect(orderCalls[0]).toEqual({ col: 'sort_order', asc: true });
  });
});
