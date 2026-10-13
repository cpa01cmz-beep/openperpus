import { describe, expect, it, vi, beforeEach } from 'vitest';

// Issue #179: klasifikasi 0-baris pada penulisan status PUT/PATCH
// /api/reservations/{id} memakai SUBSTRING regex atas gabungan `message + code`
// (route.ts di main, warisan PR #178). Error Postgres sungguhan yang detailnya
// memuat angka `406` karena itu salah-klasifikasi jadi 409 CONFLICT padahal itu
// kegagalan server (500 SAVE_FAILED) — sinjal observability (log.error +
// requestId) hilang, staf menyairnya "muat ulang" padahal penulisan gagal.
//
// Mock di bawah menirukan filter PostgREST apa adanya: `.eq('status', x)`
// diperiksa terhadap status baris SAAT penulisan dievaluasi, jadi perilaku
// 0-baris hanya tereproduksi bila route benar-benar mengirim guard itu.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PUT as BY_ID_PUT } from '@/app/api/reservations/[id]/route';

const RES_ID = '11111111-1111-4111-8111-111111111111';
const MID = '22222222-2222-4222-8222-222222222222';

type Row = {
  id: string;
  member_id: string;
  status: string;
  expires_at: string;
  loan_id: string | null;
  books: null;
};

type Filter = { col: string; val: unknown };

type Harness = {
  row: () => Row;
  calls: string[];
  audit: Record<string, unknown>[];
  /** Baris bergerak tepat saat update dimulai (checkout_reservation_tx mendarat). */
  landConcurrentCheckout: () => void;
  /** Balasan update: kegagalan DB sungguhan (bukan 0-baris guard). */
  failUpdate: (err: { code: string; message: string }) => void;
  /** Balasan update: 0-baris dalam bentuk `{ data: null, error: null }`. */
  nullEmpty: () => void;
};

function harness(initial: Partial<Row> = {}): Harness {
  let row: Row = {
    id: RES_ID,
    member_id: MID,
    status: 'pending',
    expires_at: '2026-01-01T00:00:00.000Z',
    loan_id: null,
    books: null,
    ...initial,
  };
  const calls: string[] = [];
  const audit: Record<string, unknown>[] = [];
  let dbError: { code: string; message: string } | null = null;
  let emptyResponse = false;
  let flipOnUpdate = false;

  function reservationsChain() {
    let mode: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const filters: Filter[] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => {
      calls.push('select');
      return chain;
    };
    chain.update = (p: Record<string, unknown>) => {
      mode = 'update';
      payload = p;
      calls.push('update');
      // Jendela race: baris bergerak SEBELUM penulisan kita dievaluasi.
      if (flipOnUpdate) {
        flipOnUpdate = false;
        row = { ...row, status: 'completed', loan_id: '44444444-4444-4444-8444-444444444444' };
        calls.push('race:checkout_landed');
      }
      return chain;
    };
    chain.delete = () => {
      calls.push('delete');
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      calls.push(`eq:${col}`);
      return chain;
    };
    chain.in = (col: string, vals: unknown[]) => {
      filters.push({ col, val: vals });
      calls.push(`in:${col}`);
      return chain;
    };
    chain.single = async () => {
      if (mode === 'update') {
        if (dbError) {
          const err = dbError;
          dbError = null;
          return { data: null, error: err };
        }
        if (emptyResponse) {
          emptyResponse = false;
          return { data: null, error: null };
        }
        const matched = filters.every((f) =>
          Array.isArray(f.val)
            ? (f.val as unknown[]).includes(row[f.col as keyof Row])
            : row[f.col as keyof Row] === f.val
        );
        // PostgREST: 0 baris cocok guard optimistik-lock -> PGRST116.
        if (!matched)
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, but multiple (or no) rows were returned',
            },
          };
        row = { ...row, ...(payload as Partial<Row>) };
        return { data: { ...row }, error: null };
      }
      return { data: { ...row }, error: null };
    };
    chain.maybeSingle = chain.single;
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown): Promise<unknown> =>
      Promise.resolve({ data: [], error: null }).then(res, rej);
    return chain;
  }

  const client: Record<string, unknown> = {
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin' }, error: null }) }),
          }),
        };
      if (table === 'members')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: MID }, error: null }) }),
          }),
        };
      if (table === 'activity_logs')
        return {
          insert: async (p: Record<string, unknown>) => {
            audit.push(p);
            return { error: null };
          },
        };
      if (table === 'reservations') return reservationsChain();
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    },
  };
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = client;

  return {
    row: () => row,
    calls,
    audit,
    landConcurrentCheckout: () => {
      flipOnUpdate = true;
    },
    failUpdate: (err) => {
      dbError = err;
    },
    nullEmpty: () => {
      emptyResponse = true;
    },
  };
}

function put(body: Record<string, unknown>) {
  return BY_ID_PUT(
    new Request(`http://localhost/api/reservations/${RES_ID}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: RES_ID }) }
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('issue #179 — klasifikasi 0-baris PUT reservasi', () => {
  it('transisi sah tetap 200 + query membawa guard status (regression lock)', async () => {
    const h = harness({ status: 'pending' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(200);
    expect(h.row().status).toBe('ready');
    expect(h.calls).toContain('eq:status');
    expect(h.audit.length).toBe(1);
    expect((h.audit[0] as { action: string }).action).toBe('reservations.ready');
  });

  it('guard tak cocok karena baris bergerak konkuren -> 409 (bukan ditimpa, bukan 500)', async () => {
    const h = harness({ status: 'ready' });
    h.landConcurrentCheckout();
    const res = await put({ status: 'expired' });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('CONFLICT');
    expect(h.audit.length).toBe(0);
  });

  it('0-baris dalam bentuk {data:null,error:null} tetap 409 (bukan 500)', async () => {
    const h = harness({ status: 'pending' });
    h.nullEmpty();
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('CONFLICT');
    expect(h.audit.length).toBe(0);
  });

  it('22P02 dengan literal "406" di detail -> 500 SAVE_FAILED (bukan 409)', async () => {
    const h = harness({ status: 'pending' });
    h.failUpdate({ code: '22P02', message: 'invalid input syntax for type integer: "406"' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('SAVE_FAILED');
    expect(h.audit.length).toBe(0);
  });

  it('22001 dengan nama tipe "character varying(406)" -> 500 SAVE_FAILED (bukan 409)', async () => {
    const h = harness({ status: 'pending' });
    h.failUpdate({ code: '22001', message: 'value too long for type character varying(406)' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('SAVE_FAILED');
  });

  it('kegagalan RLS asli (42501) tetap 500 (bukan disamarkan jadi konflik)', async () => {
    const h = harness({ status: 'pending' });
    h.failUpdate({ code: '42501', message: 'permission denied for table reservations' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('SAVE_FAILED');
    expect(h.audit.length).toBe(0);
  });
});
