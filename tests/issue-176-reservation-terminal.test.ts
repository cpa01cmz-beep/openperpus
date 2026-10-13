import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #176 — reservasi completed = status TERMINAL + penulisan status
// ber-optimistic-lock.
//
// Bug: PUT/PATCH /api/reservations/{id} menulis status TANPA guard CAS dan
// mengizinkan any->cancelled/expired TERMASUK dari completed. Baris completed
// (selalu punya loan_id, migrasi 0024) bisa ditimpa jadi cancelled/expired:
// loan tetap hidup, tautan audit reservasi hilang. Race nyata di jalur sweep:
// staf klik "Pinjamkan" (RPC -> completed) sementara "Tandai kedaluwarsa"
// menyiapkan PUT {status:"expired"} untuk baris yang sama (konkuren 5).
//
// Fix: (1) transisi keluar dari completed ditolak 422; (2) penulisan status
// wajib .eq('status', from) — 0 baris -> 409 CONFLICT, pola sama seperti
// legacyReturn/fines-pay; (3) penulisan tanpa perubahan status (notes/
// expires_at saja) TIDAK dijaga guard itu (tak ada konflik palsu).
//
// Mock di bawah menyimulasikan conditional write dengan jujur: UPDATE hanya
// menang bila .eq('status', from) cocok dengan status BARIS NYATA di DB
// (dbStatus) — bukan sekadar mengembalikan data selalu.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PUT as BY_ID_PUT, PATCH as BY_ID_PATCH } from '@/app/api/reservations/[id]/route';

const RES_ID = '11111111-1111-4111-8111-111111111111';
const MID = '22222222-2222-4222-8222-222222222222';

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

type DbOpts = {
  /** status yang terbaca scoped() saat SELECT (basis `from` + guard CAS) */
  seen: string;
  /** status baris NYATA di DB saat UPDATE dieksekusi (bisa sudah bergerak) */
  dbStatus: string;
  role?: string;
};

type DbProbe = {
  eqs: Array<{ col: string; val: unknown }>;
  updates: Record<string, unknown>[];
  logs: Record<string, unknown>[];
};

function setDb(opts: DbOpts): DbProbe {
  const { seen, dbStatus, role = 'admin' } = opts;
  const eqs: DbProbe['eqs'] = [];
  const updates: DbProbe['updates'] = [];
  const logs: DbProbe['logs'] = [];
  const cur = { id: RES_ID, member_id: MID, status: seen, books: null };
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }),
        }),
      };
    if (table === 'members')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: MID }, error: null }) }),
        }),
      };
    if (table === 'reservations') {
      const chain: Record<string, unknown> = {};
      let mode: 'select' | 'update' = 'select';
      chain.select = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        mode = 'update';
        updates.push(p);
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        eqs.push({ col, val });
        return chain;
      };
      chain.single = async () => {
        if (mode === 'update') {
          // Conditional write jujur: menang hanya bila guard CAS cocok baris
          // nyata. Penulisan TANPA status sengaja tak ber-guard -> tetap menang.
          const guarded = eqs.some((e) => e.col === 'status');
          if (guarded && !eqs.some((e) => e.col === 'status' && e.val === dbStatus)) {
            return {
              data: null,
              error: {
                message: 'JSON object requested, multiple (or no) rows returned',
                code: 'PGRST116',
              },
            };
          }
          return { data: { ...cur, status: dbStatus, ...(updates[0] ?? {}) }, error: null };
        }
        return { data: cur, error: null };
      };
      return chain;
    }
    if (table === 'activity_logs')
      return {
        insert: async (p: Record<string, unknown>) => {
          logs.push(p);
          return { error: null };
        },
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
  });
  return { eqs, updates, logs };
}

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const put = (body: Record<string, unknown>) =>
  BY_ID_PUT(putReq(`http://localhost/api/reservations/${RES_ID}`, body), {
    params: Promise.resolve({ id: RES_ID }),
  });
const patch = (body: Record<string, unknown>) =>
  BY_ID_PATCH(patchReq(`http://localhost/api/reservations/${RES_ID}`, body), {
    params: Promise.resolve({ id: RES_ID }),
  });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('#176 completed = status TERMINAL', () => {
  it('RES-TERM-01 PUT completed->cancelled DITOLAK 422 — tanpa update, tanpa audit', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed' });
    const res = await put({ status: 'cancelled' });
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(j.error?.code).toBe('VALIDATION');
    expect(j.error?.message).toMatch(/completed/i);
    expect(j.error?.message).toMatch(/pengembalian/i);
    expect(p.updates.length).toBe(0);
    expect(p.logs.length).toBe(0);
  });

  it('RES-TERM-02 PUT completed->expired DITOLAK 422 (skenario A: loan jadi yatim audit)', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed' });
    const res = await put({ status: 'expired' });
    expect(res.status).toBe(422);
    expect(p.updates.length).toBe(0);
    expect(p.logs.length).toBe(0);
  });

  it('RES-TERM-03 PUT completed->ready juga DITOLAK 422 (terminal sebelum tabel transisi)', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(422);
    expect(p.updates.length).toBe(0);
  });

  it('RES-TERM-04 PATCH completed->cancelled DITOLAK 422 (alias ikut terjaga)', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed' });
    const res = await patch({ status: 'cancelled' });
    expect(res.status).toBe(422);
    expect(p.updates.length).toBe(0);
    expect(p.logs.length).toBe(0);
  });

  it('RES-TERM-05 anggota (non-staf) batalkan reservasi completed sendiri -> 422', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed', role: 'member' });
    const res = await put({ status: 'cancelled' });
    expect(res.status).toBe(422);
    expect(p.updates.length).toBe(0);
    expect(p.logs.length).toBe(0);
  });

  it('RES-TERM-06 note-only pada baris completed tetap 200 (bukan transisi keluar)', async () => {
    const p = setDb({ seen: 'completed', dbStatus: 'completed' });
    const res = await put({ notes: 'dicatat setelah selesai' });
    expect(res.status).toBe(200);
    expect(p.updates.length).toBe(1);
  });
});

describe('#176 optimistic-lock penulisan status', () => {
  it('RES-CAS-01 PUT ready->expired saat baris sudah completed (race sweep) -> 409 CONFLICT', async () => {
    // Skenario B: SELECT masih `ready`, checkout RPC menyelesaikan baris
    // (completed + loan_id) sebelum UPDATE dieksekusi.
    const p = setDb({ seen: 'ready', dbStatus: 'completed' });
    const res = await put({ status: 'expired' });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(j.error?.code).toBe('CONFLICT');
    expect(j.error?.message).toMatch(/muat ulang/i);
    // Update DICOBAT (bukti guard CAS benar-benar terpasang di query)…
    expect(p.updates.length).toBe(1);
    expect(p.eqs).toContainEqual({ col: 'status', val: 'ready' });
    // …tapi 0 baris cocok -> tanpa audit + tanpa claim sukses.
    expect(p.logs.length).toBe(0);
  });

  it('RES-CAS-02 PUT pending->cancelled saat baris sudah expired (pemenang lain) -> 409', async () => {
    const p = setDb({ seen: 'pending', dbStatus: 'expired' });
    const res = await put({ status: 'cancelled' });
    expect(res.status).toBe(409);
    expect(p.eqs).toContainEqual({ col: 'status', val: 'pending' });
    expect(p.logs.length).toBe(0);
  });

  it('RES-CAS-03 transisi sah pending->ready tetap 200 + query membawa .eq("status","pending")', async () => {
    const p = setDb({ seen: 'pending', dbStatus: 'pending' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(200);
    expect(p.eqs).toContainEqual({ col: 'status', val: 'pending' });
    expect(p.eqs.some((e) => e.col === 'id')).toBe(true);
    expect(p.logs.length).toBe(1);
    expect((p.logs[0] as { action: string }).action).toBe('reservations.ready');
  });

  it('RES-CAS-04 ready->cancelled sah tetap 200 + guard .eq("status","ready")', async () => {
    const p = setDb({ seen: 'ready', dbStatus: 'ready' });
    const res = await put({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(p.eqs).toContainEqual({ col: 'status', val: 'ready' });
    expect((p.logs[0] as { action: string }).action).toBe('reservations.cancelled');
  });

  it('RES-CAS-05 tulis status yang sama (ready->ready) tetap 200', async () => {
    const p = setDb({ seen: 'ready', dbStatus: 'ready' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(200);
    expect(p.eqs).toContainEqual({ col: 'status', val: 'ready' });
  });

  it('RES-CAS-06 notes-only saat status bergerak (pending->completed) TETAP 200 — tak ada konflik palsu', async () => {
    const p = setDb({ seen: 'pending', dbStatus: 'completed' });
    const res = await put({ notes: 'tidak mengubah status' });
    expect(res.status).toBe(200);
    // Tanpa perubahan status: guard CAS sengaja TIDAK dipasang.
    expect(p.eqs.some((e) => e.col === 'status')).toBe(false);
    expect(p.updates.length).toBe(1);
    expect((p.logs[0] as { action: string }).action).toBe('reservations.update');
  });

  it('RES-CAS-07 error DB sungguhan pada tulis status tetap 500 (bukan salah-klasifikasi jadi 409)', async () => {
    const p = setDb({ seen: 'pending', dbStatus: 'pending' });
    // Payload DB mati total: semua single() on update -> error generik.
    const origin = vi.mocked(
      (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase as {
        from: (t: string) => unknown;
      }
    ).from;
    setGlobal({
      auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
      from: (table: string) => {
        if (table === 'reservations') {
          const chain: Record<string, unknown> = {};
          let mode = 'select';
          chain.select = () => chain;
          chain.update = () => {
            mode = 'update';
            return chain;
          };
          chain.eq = () => chain;
          chain.single = async () =>
            mode === 'update'
              ? { data: null, error: { message: 'connection reset', code: '08006' } }
              : { data: { id: RES_ID, member_id: MID, status: 'pending' }, error: null };
          return chain;
        }
        return origin(table);
      },
    });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    expect(p.logs.length).toBe(0);
  });
});

describe('penyimpanan & dokumentasi #176', () => {
  it('DOC-01 route: completed terminal 422 + guard CAS .eq("status", cur.status) + 409', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/reservations/[id]/route.ts'), 'utf8');
    expect(src).toMatch(/from === 'completed'/);
    expect(src).toMatch(/tidak bisa diubah lewat sini/);
    expect(src).toMatch(/\.eq\('status', cur\.status\)/);
    expect(src).toMatch(/Status reservasi sudah berubah, muat ulang dulu\./);
  });

  it('DOC-02 openapi: PUT/PATCH /api/reservations/{id} mendokumentasikan 409 + 422', () => {
    const spec = readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8');
    expect(spec).toMatch(/Status reservasi sudah berubah, muat ulang dulu\./);
    expect(spec).toMatch(/sudah selesai \(completed\)/);
  });
});
