import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #75: hapus member/buku = soft-delete (histori loans tetap ada) +
// opname mengembalikan diff per baris + 1 audit row berisi full diff.

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

const MID = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mctx = { params: Promise.resolve({ id: MID }) };

type Chain = Record<string, (...a: unknown[]) => unknown>;

function profilesAdmin() {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { role: 'admin' }, error: null }),
      }),
    }),
  };
}

function loansChain(count: number, rows: { book_id: string }[] = []) {
  const c: Chain = {};
  c.select = () => c;
  c.eq = () => c;
  c.in = () => c;
  (c as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count }).then(res);
  return c;
}

const authAdmin = {
  getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }),
};

describe('issue #75 — kontrak sumber (source-contains)', () => {
  it('migrasi 0030 menambah members.deleted_at + index parsial', () => {
    const m = read('supabase/migrations/0030_issue75_soft_delete.sql');
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS deleted_at/);
    expect(m).toMatch(/idx_members_deleted_at/);
    expect(m).toMatch(/WHERE deleted_at IS NULL/);
  });

  it('DELETE members = soft (deleted_at + anonimisasi), bukan .delete()', () => {
    const src = read('src/app/api/members/[id]/route.ts');
    expect(src).toMatch(/deleted_at/);
    expect(src).toMatch(/phone:\s*null/);
    expect(src).toMatch(/address:\s*null/);
    expect(src).not.toMatch(/from\('members'\)\.delete/);
    expect(src).toMatch(/409/);
  });

  it('GET list members filter deleted_at IS NULL; PUT 404 bila soft-deleted', () => {
    expect(read('src/app/api/members/route.ts')).toMatch(/\.is\('deleted_at',\s*null\)/);
    expect(read('src/app/api/members/[id]/route.ts')).toMatch(/NOT_FOUND/);
  });

  it('DELETE books = soft (is_active=false), bukan .delete(); GET publik filter is_active', () => {
    const bulk = read('src/app/api/books/route.ts');
    expect(bulk).toMatch(/update\(\{\s*is_active:\s*false\s*\}\)/);
    expect(bulk).not.toMatch(/from\('books'\)\.delete/);
    expect(bulk).toMatch(/\.eq\('is_active',\s*true\)/);
    expect(read('src/app/api/books/[id]/route.ts')).toMatch(
      /update\(\{\s*is_active:\s*false\s*\}\)/
    );
  });

  it('opname: diffs per baris + clamp active + komentar ponytail', () => {
    const src = read('src/app/api/books/route.ts');
    expect(src).toMatch(/old_available/);
    expect(src).toMatch(/new_available/);
    expect(src).toMatch(/diffs/);
    expect(src).toMatch(/ponytail/);
  });
});

describe('issue #75 — perilaku (mock ringan)', () => {
  it('DELETE members mengeset deleted_at (bukan .delete())', async () => {
    const { DELETE } = (await import('@/app/api/members/[id]/route')) as unknown as {
      DELETE: (req: Request, ctx: unknown) => Promise<Response>;
    };
    let updatePayload: Record<string, unknown> | null = null;
    let deleteCalled = false;
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profilesAdmin();
      if (table === 'loans') return loansChain(0);
      if (table === 'members') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.update = (p: unknown) => {
          updatePayload = p as Record<string, unknown>;
          return chain;
        };
        chain.delete = () => {
          deleteCalled = true;
          return chain;
        };
        chain.eq = () => chain;
        chain.single = async () => ({ data: { id: MID, deleted_at: null }, error: null });
        (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(res);
        return chain;
      }
      return {};
    });
    setGlobal({ auth: authAdmin, from });
    const res = await DELETE(new Request('http://localhost/api/x', { method: 'DELETE' }), mctx);
    expect(res.status).toBe(200);
    expect(deleteCalled).toBe(false);
    expect(updatePayload?.phone).toBeNull();
    expect(updatePayload?.address).toBeNull();
    expect(typeof updatePayload?.deleted_at).toBe('string');
  });

  it('DELETE members tetap 409 bila loan aktif', async () => {
    const { DELETE } = (await import('@/app/api/members/[id]/route')) as unknown as {
      DELETE: (req: Request, ctx: unknown) => Promise<Response>;
    };
    setGlobal({
      auth: authAdmin,
      from: vi.fn((table: string) => (table === 'profiles' ? profilesAdmin() : loansChain(2))),
    });
    const res = await DELETE(new Request('http://localhost/api/x', { method: 'DELETE' }), mctx);
    expect(res.status).toBe(409);
  });

  it('DELETE books bulk mengeset is_active=false + skip loan aktif', async () => {
    const { DELETE } = (await import('@/app/api/books/route')) as unknown as {
      DELETE: (req: Request) => Promise<Response>;
    };
    let updatePayload: Record<string, unknown> | null = null;
    let inIds: string[] | null = null;
    let deleteCalled = false;
    const audit: Record<string, unknown>[] = [];
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profilesAdmin();
      if (table === 'loans') return loansChain(0, [{ book_id: B }]);
      if (table === 'books') {
        const c: Chain = {};
        c.update = (p: unknown) => {
          updatePayload = p as Record<string, unknown>;
          return c;
        };
        c.delete = () => {
          deleteCalled = true;
          return c;
        };
        c.in = (_col: unknown, vals: unknown) => {
          inIds = vals as string[];
          return c;
        };
        c.eq = () => c;
        (c as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(res);
        return c;
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
    setGlobal({ auth: authAdmin, from });
    const res = await DELETE(
      new Request(`http://localhost/api/books?id=${A},${B}`, { method: 'DELETE' })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { deleted: string[]; skipped: string[] } };
    expect(j.data.deleted).toEqual([A]);
    expect(j.data.skipped).toEqual([B]);
    expect(deleteCalled).toBe(false);
    expect(updatePayload).toEqual({ is_active: false });
    expect(inIds).toEqual([A]);
    expect(audit.filter((r) => r.action === 'books.delete')).toHaveLength(1);
  });

  it('opname mengembalikan diffs + 1 audit berisi full diff', async () => {
    const { PUT } = (await import('@/app/api/books/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
    };
    const audit: Record<string, unknown>[] = [];
    const books: Record<string, { stock_total: number; stock_available: number }> = {
      [A]: { stock_total: 10, stock_available: 8 },
    };
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profilesAdmin();
      if (table === 'loans') return loansChain(0);
      if (table === 'books') {
        const chain: Record<string, unknown> = {};
        let inIds: string[] = [];
        chain.select = () => chain;
        chain.in = (_col: unknown, vals: unknown) => {
          inIds = vals as string[];
          return chain;
        };
        chain.upsert = (rows: unknown) => Promise.resolve({ data: rows, error: null });
        (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: inIds.map((id) => ({ id, ...(books[id] ?? {}) })),
            error: null,
          }).then(res);
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
    setGlobal({ auth: authAdmin, from });
    const res = await PUT(
      new Request('http://localhost/api/books', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'stock_opname',
          items: [{ id: A, stock_total: 12, stock_available: 9 }],
        }),
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: {
        updated: string[];
        skipped: unknown[];
        diffs: { id: string; old_available: number | null; new_available: number }[];
      };
    };
    expect(j.data.updated).toEqual([A]);
    expect(j.data.diffs).toEqual([{ id: A, old_available: 8, new_available: 9 }]);
    const opname = audit.filter((r) => r.action === 'books.stock_opname');
    expect(opname).toHaveLength(1);
    expect((opname[0] as { metadata: { diffs: unknown[] } }).metadata.diffs).toHaveLength(1);
  });
});
