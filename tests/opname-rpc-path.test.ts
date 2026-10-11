// S-0033 Jalur ATOMIK opname (RPC stock_opname_tx) — review PR #117.
// Temuan: mapping guard `typeof ... rpc === 'function'` mengirim request
// produksi ke RPC, tapi semua mock opname hanya menyediakan `from`, sehingga
// 100% tes opname tetap berjalan di jalur non-atomik. Cakupan nol untuk:
// pemakaian RPC, pemetaan SQLSTATE, dan bahaya hasil ambigu.
// File ini men-stop jalur RPC (sukses, data null, throw, error) dan memastikan
// fallback legacy HANYA dipakai untuk RPC-belum-terdeploy (kode 42883/PGRST202
// ATAU pesan regex) / klien tanpa .rpc. Ketiga trigger rpcMissing, guard role
// non-staf, baris buku dipinjam, dan predikat stok fallback (identik dengan
// RPC) semuanya ter-cover di bawah.
// ATOM-13..15 menutup sisa review PR #122 pada jalur fallback: cek eksistensi
// (id tak dikenal tidak boleh menjatuhkan seluruh batch), normalisasi -0
// (paritas dengan jsonb/RPC yang menulis 0), dan gagal baca yang jujur.

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
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8bbb-dddddddddddd';
const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const F = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
/** UUID valid tetapi TIDAK ADA di tabel books (kasus cek eksistensi). */
const Z = '99999999-9999-4999-8999-999999999999';

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
  /** id yang ADA di tabel books. Default: semua id yang diminta ada. */
  existingBooks?: string[];
  /** stock_available lama per id (dipakai `old_available` pada diffs). */
  currentStock?: Record<string, number>;
  /** true: `select` buku gagal (kasus gagal baca eksistensi -> 500 jujur). */
  readError?: boolean;
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
      // Fallback: cek eksistensi DIAMBIL sebelum loop (`.in('id', validIds)`),
      // lalu satu upsert bulk. Hanya id yang lolos eksistensi yang sampai ke
      // payload upsert — id tak dikenal tidak boleh membuat batch runtuh.
      const chain: Record<string, unknown> = {};
      let inIds: string[] = [];
      chain.select = () => chain;
      chain.in = (_col: unknown, vals: unknown) => {
        inIds = vals as string[];
        return chain;
      };
      chain.upsert = (rows: unknown) => {
        upserts.push(rows);
        return Promise.resolve({ data: rows, error: null });
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) => {
        if (opts.readError)
          return Promise.resolve({ data: null, error: { message: 'read failed' } }).then(res);
        const exists = opts.existingBooks ?? inIds;
        const rowsData = exists.map((id) => ({
          id,
          stock_available: opts.currentStock?.[id] ?? 8,
        }));
        return Promise.resolve({ data: rowsData, error: null }).then(res);
      };
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

  it('ATOM-08 RPC belum terdeploy via PESAN (tanpa kode): regex pesan memicu fallback', async () => {
    // Deploy Supabase nyata: fungsi hilang dari schema cache -> PostgREST
    // mengembalikan PESAN "Could not find the function ... stock_opname_tx"
    // (kadang tanpa kode yang dikenali klien). Trigger ketiga rpcMissing.
    const { rpcCalls, upserts } = setMock({
      rpc: {
        data: null,
        error: {
          message:
            'Could not find the function public.stock_opname_tx(p_items) in the schema cache',
        },
      },
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
    expect(upserts, 'regex pesan harus membuka fallback legacy').toEqual([
      [{ id: A, stock_total: 12, stock_available: 9 }],
    ]);
  });

  it('ATOM-09 pesan DB yang HANYA menyebut nama fungsi TIDAK memicu fallback (regex tidak over-broad)', async () => {
    // Guard: regresi regex yang terlalu luas akan menghidupkan lagi lubang
    // dobel-apply — error DB biasa (bukan "belum terdeploy") harus 500.
    const { upserts } = setMock({
      rpc: { data: null, error: { code: '55P03', message: 'stock_opname_tx: lock not available' } },
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('SAVE_FAILED');
    expect(upserts, 'error DB nyata tidak boleh jatuh ke jalur non-atomik').toEqual([]);
  });

  it('ATOM-10 fallback: buku dipinjam dilewati dengan reason (KONTRAK RPC == fallback)', async () => {
    const { rpcCalls, upserts } = setMock({
      rpc: { data: null, error: { code: '42883', message: 'function does not exist' } },
      activeLoans: [{ book_id: A }],
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
    expect(j.data.updated).toEqual([]);
    expect(j.data.skipped).toEqual([{ id: A, reason: 'Dilewati: buku masih dipinjam.' }]);
    expect(upserts, 'buku dipinjam tidak boleh di-upsert').toEqual([]);
    expect(rpcCalls.length, 'RPC tetap dicoba lebih dulu (feature detection)').toBe(1);
  });

  it('ATOM-11 guard role: non-staf ditolak 403 SEBELUM RPC dipanggil', async () => {
    const { rpcCalls } = setMock({
      rpc: { data: { updated: [], skipped: [], diffs: [] }, error: null },
      role: 'member',
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('FORBIDDEN');
    expect(rpcCalls, 'guard role harus menolak sebelum menyentuh RPC').toEqual([]);
  });

  it('ATOM-12 fallback: predikat stok KETAT seperti RPC — null/""/true/"5.0"/int4-overflow dilewati', async () => {
    // Perilaku identik dengan stock_opname_tx (migrasi 0033): hanya bilangan
    // bulat >= 0 (angka JSON atau string digit, maks 10 digit). Number()
    // dulu menerima null/""/true -> 0/1 dan MENULIS stok 0/1 ke DB.
    const { upserts } = setMock({});
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [
          { id: A, stock_total: null, stock_available: null },
          { id: B, stock_total: '', stock_available: '' },
          { id: C, stock_total: true, stock_available: true },
          { id: D, stock_total: '5.0', stock_available: 5 },
          { id: E, stock_total: 2147483648, stock_available: 1 },
          { id: F, stock_total: '12', stock_available: 12 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated, 'hanya string digit 12 yang sah').toEqual([F]);
    expect(j.data.skipped.map((s) => s.id).sort()).toEqual([A, B, C, D, E].sort());
    expect(
      j.data.skipped.every((s) => s.reason === 'Stok tidak valid: harus bilangan bulat >= 0.'),
      'semua baris invalid wajib reason stok tidak valid'
    ).toBe(true);
    expect(upserts).toEqual([[{ id: F, stock_total: 12, stock_available: 12 }]]);
  });

  it('ATOM-13 fallback: id tak ada TIDAK menjatuhkan batch — hanya baris itu yang dilewati', async () => {
    // Review PR #122: tanpa cek eksistensi, id tak dikenal jatuh ke `upsert`
    // dan memicu NOT NULL title/slug/author (0001_core.sql) sehingga SELURUH
    // batch gagal -> semua baris 'Gagal menyimpan.' dengan HTTP 200. RPC justru
    // hanya melewati baris itu dengan 'Buku tidak ditemukan.'.
    const { rpcCalls, upserts } = setMock({
      rpc: { data: null, error: { code: '42883', message: 'function does not exist' } },
      existingBooks: [A],
      currentStock: { [A]: 8 },
    });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [
          { id: A, stock_total: 12, stock_available: 9 },
          { id: Z, stock_total: 12, stock_available: 9 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated, 'baris sah tetap terupdate').toEqual([A]);
    expect(j.data.skipped, 'hanya baris tak dikenal yang dilewati').toEqual([
      { id: Z, reason: 'Buku tidak ditemukan.' },
    ]);
    expect(j.data.diffs).toEqual([{ id: A, old_available: 8, new_available: 9 }]);
    expect(upserts, 'id tak ada tidak boleh masuk payload upsert').toEqual([
      [{ id: A, stock_total: 12, stock_available: 9 }],
    ]);
    expect(rpcCalls.length, 'RPC tetap dicoba lebih dulu (feature detection)').toBe(1);
  });

  it('ATOM-14 fallback: -0 dinormalkan jadi 0 (paritas jsonb/RPC yang MENULIS 0)', async () => {
    // UI menghasilkan -0 lewat Number("-0"); JSON.stringify(-0) menghasilkan
    // "-0"; jsonb Postgres menormalkan -0 menjadi 0 sehingga `->>` = '0' LOLOS
    // predikat RPC dan stok ditulis 0. Fallback dulu MENOLAK nilai yang sama
    // ('Stok tidak valid') — dua jalur berbeda untuk masukan identik.
    const { upserts } = setMock({});
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 0, stock_available: -0 }],
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: OpnameResult };
    expect(j.data.updated).toEqual([A]);
    expect(j.data.diffs).toEqual([{ id: A, old_available: 8, new_available: 0 }]);
    const written = (upserts[0] as { stock_available: number }[])[0];
    expect(Object.is(written.stock_available, 0), '-0 wajib ditulis sebagai 0, bukan -0').toBe(
      true
    );
  });

  it('ATOM-15 fallback: kegagalan baca eksistensi -> 500 jujur, bukan 200 dengan semua baris dilewati', async () => {
    // Sebelumnya kegagalan `select` buku diabaikan; dengan cek eksistensi itu
    // akan membuat SEMUA baris tampak "tidak ditemukan" dan opname
    // mengembalikan 200 kosong. Harus gagal eksplisit.
    setMock({ readError: true });
    const PUT = await put();
    const res = await PUT(
      putReq('http://localhost/api/books', {
        action: 'stock_opname',
        items: [{ id: A, stock_total: 12, stock_available: 9 }],
      })
    );
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('SAVE_FAILED');
  });
});
