import { describe, expect, it, vi, beforeEach } from 'vitest';

// PUT /api/reservations/{id} menulis status TANPA guard optimistic-lock (issue #176):
// baris yang sudah `completed` (punya loan_id, checkout_reservation_tx migrasi 0024)
// bisa ditimpa jadi cancelled/expired, baik lewat panggilan langsung maupun race
// dengan sweep/checkout konkuren. Mock di bawah menirukan filter PostgREST apa
// adanya: `.eq('status', x)` diperiksa terhadap status baris SAAT penulisan, jadi
// 0-baris hanya bisa terdeteksi bila route benar-benar mengirim guard itu.

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
const LOAN_ID = '44444444-4444-4444-8444-444444444444';

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
  /** Dipanggil tepat saat update dimulai: menirukan checkout_reservation_tx yang mendarat lebih dulu. */
  landConcurrentCheckout: () => void;
  /** Baris benar-benar hilang sebelum penulisan dievaluasi (DELETE konkuren). */
  deleteRow: () => void;
  /** Penulisan membalas 0-baris dalam bentuk `{ data: null, error: null }`. */
  zeroRows: () => void;
  /** Gagal DB sungguhan pada penulisan (bukan 0-baris guard). */
  failUpdate: (err: { code: string; message: string }) => void;
};

function harness(initial: Partial<Row> = {}): Harness {
  const initialRow: Row = {
    id: RES_ID,
    member_id: MID,
    status: 'ready',
    expires_at: '2026-01-01T00:00:00.000Z',
    loan_id: null,
    books: null,
    ...initial,
  };
  const calls: string[] = [];
  const audit: Record<string, unknown>[] = [];
  let dbError: { code: string; message: string } | null = null;
  /** Bentuk balasan 0-baris alternatif ({ data: null, error: null }) — beberapa klien/mock. */
  let nullEmpty = false;
  /** Baris hilang tepat saat penulisan dimulai (DELETE konkuren). */
  let deleteOnUpdate = false;
  let row: Row | undefined = initialRow;

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
      if (dbError || nullEmpty) return chain;
      // Jendela race: baris hilang SEBELUM penulisan kita dievaluasi.
      if (deleteOnUpdate) {
        deleteOnUpdate = false;
        row = undefined;
        calls.push('race:row_deleted');
      }
      // Jendela race: RPC checkout mendarat SEBELUM penulisan kita dievaluasi.
      if (row?.status === 'ready') {
        row = { ...row, status: 'completed', loan_id: LOAN_ID };
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
        if (nullEmpty) {
          nullEmpty = false;
          return { data: null, error: null };
        }
        const matched =
          row !== undefined &&
          filters.every((f) =>
            Array.isArray(f.val)
              ? (f.val as unknown[]).includes(row![f.col as keyof Row])
              : row![f.col as keyof Row] === f.val
          );
        // PostgREST: 0 baris cocok guard (atau baris hilang) -> PGRST116, data null.
        if (!matched)
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, but multiple (or no) rows were returned',
            },
          };
        row = { ...row!, ...(payload as Partial<Row>) };
        return { data: { ...row }, error: null };
      }
      return { data: row ? { ...row } : null, error: null };
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
    row: () => row as Row,
    calls,
    audit,
    landConcurrentCheckout: () => {
      if (row) row = { ...row, status: 'completed', loan_id: LOAN_ID };
    },
    deleteRow: () => {
      deleteOnUpdate = true;
    },
    zeroRows: () => {
      nullEmpty = true;
    },
    failUpdate: (err) => {
      dbError = err;
    },
  };
}

function putReq(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/reservations/${RES_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function put(body: Record<string, unknown>) {
  return BY_ID_PUT(putReq(body), { params: Promise.resolve({ id: RES_ID }) });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('issue #176 — PUT reservations/[id]: guard status + completed terminal', () => {
  it('menangani baris yang baru selesai checkout tanpa menimpa completed/loan_id (race)', async () => {
    const h = harness({ status: 'ready' });
    const res = await put({ status: 'expired' });
    // Transisi sah menurut status yang dibaca, tetapi baris sudah bergerak.
    expect(res.status).toBe(409);
    expect(h.row().status).toBe('completed');
    expect(h.row().loan_id).toBe(LOAN_ID);
    expect(h.audit.length).toBe(0);
  });

  it('menolak PUT completed->expired / completed->cancelled (terminal, hanya lewat checkout)', async () => {
    for (const next of ['expired', 'cancelled']) {
      const h = harness({ status: 'completed', loan_id: LOAN_ID });
      const res = await put({ status: next });
      expect(res.status).toBe(422);
      const json = (await res.json()) as { error?: { code?: string; message?: string } };
      expect(json.error?.code).toBe('VALIDATION');
      expect(h.row().status).toBe('completed');
      expect(h.row().loan_id).toBe(LOAN_ID);
      expect(h.calls).not.toContain('update');
      expect(h.audit.length).toBe(0);
    }
  });

  it('transisi sah tetap 200 dan query membawa guard .eq("status", status-awal)', async () => {
    const h = harness({ status: 'pending' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(200);
    expect(h.row().status).toBe('ready');
    expect(h.calls).toContain('eq:status');
    expect(h.audit.length).toBe(1);
    expect((h.audit[0] as { action: string }).action).toBe('reservations.ready');
  });

  it('update tanpa perubahan status (notes) tetap 200 walau status bergerak konkuren', async () => {
    const h = harness({ status: 'ready' });
    h.landConcurrentCheckout();
    const res = await put({ notes: 'catatan staf' });
    expect(res.status).toBe(200);
    expect(h.row().status).toBe('completed');
    expect(h.row().loan_id).toBe(LOAN_ID);
  });

  it('kegagalan DB sungguhan tetap 500 (bukan disamarkan jadi konflik 409)', async () => {
    const h = harness({ status: 'pending' });
    h.failUpdate({ code: '42501', message: 'permission denied for table reservations' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('SAVE_FAILED');
    expect(h.audit.length).toBe(0);
  });

  it('error 22P02 yang memuat angka "406" di detail tetap 500 (bukan salah klasifikasi 409)', async () => {
    // Detail Postgres bisa menyelipkan angka sembarang; substring "406" di dalam
    // pesan bukan sinyal 0-baris.
    const h = harness({ status: 'pending' });
    h.failUpdate({ code: '22P02', message: 'invalid input syntax for type integer: "406"' });
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(500);
    expect(h.audit.length).toBe(0);
  });

  it('penulisan status yang melaporkan {data:null,error:null} tetap 409 (0-baris, bukan 500)', async () => {
    // Beberapa klien/mock membalas { data: null, error: null } untuk 0 baris —
    // kelonggaran yang sama seperti deteksi pemenang konkuren legacyReturn.ts:313.
    const h = harness({ status: 'pending' });
    h.zeroRows();
    const res = await put({ status: 'ready' });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('CONFLICT');
  });

  it('write non-status pada baris yang hilang juga 409 (bukan 500 seperti sebelumnya)', async () => {
    const h = harness({ status: 'ready' });
    h.deleteRow();
    const res = await put({ notes: 'catatan staf' });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.code).toBe('CONFLICT');
    expect(json.error?.message).toContain('muat ulang');
    expect(h.audit.length).toBe(0);
  });
});
