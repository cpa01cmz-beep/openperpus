// S-0033 Jalur ATOMIK opname (RPC stock_opname_tx) — review PR #117.
// Temuan: mapping guard `typeof ... rpc === 'function'` mengirim request
// produksi ke RPC, tapi semua mock opname hanya menyediakan `from`, sehingga
// 100% tes opname tetap berjalan di jalur non-atomik. Cakupan nol untuk:
// pemakaian RPC, pemetaan SQLSTATE, dan bahaya hasil ambigu.
// File ini men-stop jalur RPC (sukses, data null, throw, error) dan memastikan
// fallback legacy HANYA dipakai untuk RPC-belum-terdeploy / klien tanpa .rpc.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type OpnameResult = {
  updated: string[];
  skipped: { id: string; reason: string }[];
  diffs: unknown[];
};

type MockOpts = {
  /** Balikan RPC. Fungsi = dipanggil saat rpc() dipanggil (mis. untuk melempar). */
  rpc?: unknown;
  role?: string;
  activeLoans?: { book_id: string }[];
};

function setMock(opts: MockOpts) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const upserts: unknown[] = [];

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
      chain.select = () => chain;
      chain.in = () => chain;
      chain.upsert = (rows: unknown) => {
        upserts.push(rows);
        return Promise.resolve({ data: rows, error: null });
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    }
    if (table === 'activity_logs') {
      return { insert: async () => ({ error: null }) };
    }
    return {};
  });

  const mock: Record<string, unknown> = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'U-ADMIN' } },
        error: null,
      }),
    },
    from,
  };
  if (opts.rpc !== undefined) {
    mock.rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (typeof opts.rpc === 'function') return (opts.rpc as () => unknown)();
      return opts.rpc;
    });
  }
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
  return { rpcCalls, upserts };
}

async function put() {
  return (await import('@/app/api/books/route')).PUT as (req: Request) => Promise<Response>;
}

describe('S-0033 jalur atomik opname (RPC stock_opname_tx)', () => {
  it('ATOM-01 sukses RPC: 200 memakai balikan RPC, TANPA upsert legacy', async () => {
    const payload: OpnameResult = {
      updated: [A],
      skipped: [],
      diffs: [{ id: A, old_available: 8, new_available: 9 }],
    };
    const { rpcCalls, upserts } = setMock({
      rpc: { data: payload, error: null },
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data, 'balasan harus balikan RPC, bukan orkestrasi aplikasi').toEqual(payload);
    expect(rpcCalls.map((c) => c.fn)).toEqual(['stock_opname_tx']);
    expect(rpcCalls[0].args.p_user_id).toBe('U-ADMIN');
    expect(upserts, 'jalur atomik tidak boleh menulis lewat upsert aplikasi').toEqual([]);
  });

  it('ATOM-02 RPC tanpa error tapi data null: TIDAK diulang via jalur non-atomik', async () => {
    const { rpcCalls, upserts } = setMock({ rpc: { data: null, error: null } });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    // Sebelumnya: `if (!error && data)` gagal -> jatuh ke fallback -> opname
    // termuat dua kali + audit ganda.
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated).toEqual([]);
    expect(upserts, 'hasil ambigu tidak boleh diulang lewat jalur non-atomik').toEqual([]);
    expect(rpcCalls.length).toBe(1);
  });

  it('ATOM-03 RPC melempar: 500 SAVE_FAILED, bukan jatuh ke fallback', async () => {
    const { upserts } = setMock({
      // network/timeout: status commit tidak diketahui — mengulang = dobel-apply.
      rpc: () => {
        throw new Error('network down');
      },
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('SAVE_FAILED');
    expect(upserts, 'status commit tidak diketahui — tidak boleh diulang').toEqual([]);
  });

  it('ATOM-04 SQLSTATE 22000: 422 dengan pesan tetap, teks DB TIDAK bocor ke klien', async () => {
    const raw = 'Maksimal 100 item per stock_opname. (internal pg detail 0xDEAD)';
    setMock({ rpc: { data: null, error: { code: '22000', message: raw } } });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('Data opname tidak valid.');
    expect(JSON.stringify(j)).not.toContain('0xDEAD');
  });

  it('ATOM-05 SQLSTATE 42501: 403 FORBIDDEN', async () => {
    setMock({ rpc: { data: null, error: { code: '42501', message: 'not staff' } } });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(403);
  });

  it('ATOM-06 RPC belum terdeploy (42883): fallback legacy DIPAKAI', async () => {
    const { rpcCalls, upserts } = setMock({
      rpc: { data: null, error: { code: '42883', message: 'function does not exist' } },
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated).toEqual([A]);
    expect(rpcCalls.length).toBe(1);
    expect(upserts, 'fallback legacy harus benar-benar dieksekusi').toEqual([
      [{ id: A, stock_total: 12, stock_available: 9 }],
    ]);
  });

  it('ATOM-07 klien tanpa .rpc: feature-detection jatuh ke legacy (kelanjutan kontrak lama)', async () => {
    const { upserts } = setMock({});
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated).toEqual([A]);
    expect(upserts).toEqual([[{ id: A, stock_total: 12, stock_available: 9 }]]);
  });
});
