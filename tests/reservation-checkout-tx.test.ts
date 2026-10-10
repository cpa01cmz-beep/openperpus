import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #73: checkout reservasi atomik.
// 1) API POST /api/reservations/[id]/checkout — satu panggilan, seluruh kerja
//    di RPC checkout_reservation_tx (migrasi 0024): lock reservasi+buku,
//    gate kelayakan, insert loan, update reservasi completed+loan_id.
//    SQLSTATE dipetakan ke jsonError; PUT status=completed ditolak (422).
// 2) Invariant migrasi 0024 di audit sebagai kontrak SQL.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as CHECKOUT_POST } from '@/app/api/reservations/[id]/checkout/route';

const RES_ID = '11111111-1111-4111-8111-111111111111';

type MockSupabase = Record<string, unknown>;

function setMock(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function checkoutReq(body: unknown = {}) {
  return new Request(`http://localhost/api/reservations/${RES_ID}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(id: string = RES_ID) {
  return { params: Promise.resolve({ id }) };
}

function staffMock(opts: { role?: string; rpc?: unknown } = {}) {
  const role = opts.role ?? 'admin';
  const rpcDefault = {
    data: {
      loan: { id: 'loan-1', status: 'borrowed', book_id: 'B-1', member_id: 'M-1' },
      reservation: { id: RES_ID, status: 'completed', loan_id: 'loan-1' },
      idempotent: false,
    },
    error: null,
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'U1' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role }, error: null }),
            }),
          }),
        };
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    }),
    rpc: vi.fn(async () => (opts.rpc !== undefined ? opts.rpc : rpcDefault)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/reservations/[id]/checkout (issue #73)', () => {
  it('happy: staf -> 201 { data: { loan, reservation } } via RPC checkout_reservation_tx', async () => {
    const mock = staffMock();
    setMock(mock);
    const res = await CHECKOUT_POST(checkoutReq(), ctx());
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      data: { loan: { id: string }; reservation: { status: string; loan_id: string } };
      revalidated: string[];
    };
    expect(json.data.loan.id).toBe('loan-1');
    expect(json.data.reservation.status).toBe('completed');
    expect(json.data.reservation.loan_id).toBe('loan-1');
    expect(json.revalidated).toContain('/admin/reservasi');
    expect(mock.rpc).toHaveBeenCalledWith(
      'checkout_reservation_tx',
      expect.objectContaining({ p_reservation_id: RES_ID })
    );
  });

  it('body opsional: notes dipangkas + dibatasi 500 karakter', async () => {
    const mock = staffMock();
    setMock(mock);
    await CHECKOUT_POST(checkoutReq({ notes: '  pinjam cepat  ' }), ctx());
    expect(mock.rpc).toHaveBeenCalledWith(
      'checkout_reservation_tx',
      expect.objectContaining({ p_notes: 'pinjam cepat' })
    );
  });

  it('notes > 500 karakter -> 422 sebelum RPC', async () => {
    const mock = staffMock();
    setMock(mock);
    const res = await CHECKOUT_POST(checkoutReq({ notes: 'x'.repeat(501) }), ctx());
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('due_at tidak valid -> 422 sebelum RPC', async () => {
    const mock = staffMock();
    setMock(mock);
    const res = await CHECKOUT_POST(checkoutReq({ due_at: 'bukan-tanggal' }), ctx());
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('id reservasi bukan UUID -> 400 VALIDATION (issues #54: satu aturan UUID)', async () => {
    setMock(staffMock());
    const res = await CHECKOUT_POST(checkoutReq(), ctx('bukan-uuid'));
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: { code?: string } };
    expect(j.error?.code).toBe('VALIDATION');
  });

  it('non-staff (anggota) -> 403 dari requireStaff', async () => {
    setMock(staffMock({ role: 'member' }));
    const res = await CHECKOUT_POST(checkoutReq(), ctx());
    expect(res.status).toBe(403);
  });

  it('RPC belum terdeploy (42883) -> 500 dengan pesan jalankan migrasi 0024', async () => {
    setMock(
      staffMock({
        rpc: { data: null, error: { code: '42883', message: 'could not find function' } },
      })
    );
    const res = await CHECKOUT_POST(checkoutReq(), ctx());
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain('migrasi 0024');
  });

  it.each([
    ['25000', 'Stok buku habis.', 409, 'CONFLICT'],
    ['25001', 'Anggota sudah meminjam buku ini (loan aktif).', 409, 'CONFLICT'],
    ['25002', 'Anggota memiliki tagihan denda 50000 yang belum lunas.', 409, 'CONFLICT'],
    ['25003', 'Anggota memiliki 2 peminjaman terlambat.', 409, 'CONFLICT'],
    ['25004', 'Anggota sudah meminjam 3 buku (batas 3).', 409, 'CONFLICT'],
    ['25006', 'Reservasi belum siap diambil (status pending).', 409, 'CONFLICT'],
    ['02000', 'Reservasi tidak ditemukan.', 404, 'NOT_FOUND'],
    ['22005', 'Anggota tidak aktif (suspended/expired/pending).', 422, 'VALIDATION'],
    ['22000', 'due_at harus sesudah borrowed_at.', 422, 'VALIDATION'],
    ['42501', 'Hanya pustakawan yang boleh memproses reservasi.', 403, 'FORBIDDEN'],
  ])('SQLSTATE %s -> %i %s', async (code, message, status, jsonCode) => {
    setMock(staffMock({ rpc: { data: null, error: { code, message } } }));
    const res = await CHECKOUT_POST(checkoutReq(), ctx());
    expect(res.status).toBe(status);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(jsonCode);
  });

  it('SQLSTATE tak dikenal -> 500 SAVE_FAILED (fail-closed)', async () => {
    setMock(staffMock({ rpc: { data: null, error: { code: 'XX000', message: 'boom' } } }));
    const res = await CHECKOUT_POST(checkoutReq(), ctx());
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SAVE_FAILED');
  });
});

describe('migrasi 0024_checkout_reservation_tx.sql — kontrak SQL', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/0024_checkout_reservation_tx.sql'),
    'utf8'
  );
  const low = sql.toLowerCase();

  it('mengunci reservasi + buku (FOR UPDATE) — anti race/doppel-klik', () => {
    expect(low).toContain('for update');
    expect(low.match(/for update/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('menambah reservations.loan_id + FK RESTRICT + unique parsial', () => {
    expect(low).toContain('add column if not exists loan_id');
    expect(low).toContain('reservations_loan_id_fkey');
    expect(low).toContain('on delete restrict');
    expect(low).toContain('create unique index if not exists uq_reservations_loan_id');
  });

  it('invariant completed wajib loan_id (CHECK ... NOT VALID)', () => {
    expect(low).toContain('reservations_completed_needs_loan');
    expect(low).toContain("status <> 'completed' or loan_id is not null");
    expect(low).toContain('not valid');
  });

  it('state-machine ketat: hanya status ready yang bisa checkout', () => {
    expect(low).toContain("v_res.status <> 'ready'");
    expect(low).toContain("'25006'");
  });

  it('idempoten: completed + loan_id -> hasil lama dikembalikan', () => {
    expect(low).toContain("v_res.status = 'completed' and v_res.loan_id is not null");
    expect(low).toContain("'idempotent', true");
  });

  it('gate kelayakan anggota (denda/terlambat/batas) ditegakkan di DB', () => {
    expect(low).toContain("status in ('unpaid', 'partial')");
    expect(low).toContain('max_active_loans');
    for (const code of ["'25002'", "'25003'", "'25004'"]) {
      expect(low).toContain(code);
    }
  });

  it('grant minimal: authenticated saja, anon/public dicabut', () => {
    expect(low).toContain('revoke all on function public.checkout_reservation_tx');
    expect(low).toContain('from anon, public');
    expect(low).toContain(
      'grant execute on function public.checkout_reservation_tx(uuid, timestamptz, timestamptz, text) to authenticated'
    );
  });

  it('audit log atomik di dalam transaksi yang sama', () => {
    expect(low).toContain("'loans.create'");
    expect(low).toContain("'reservations.completed'");
    expect(low).toContain('insert into public.activity_logs');
  });
});

describe('UI admin — tombol Selesaikan tanpa loan dihapus', () => {
  it('halaman reservasi tak lagi menawarkan aksi completed langsung', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/admin/reservasi/page.tsx'), 'utf8');
    expect(src).not.toContain('Selesaikan');
    expect(src).not.toContain("onUpdate(r.id, 'completed')");
    // Jalur tersisa: Setujui (pending->ready) + Pinjamkan (checkout atomik) + Batal.
    expect(src).toContain("onUpdate(r.id, 'ready')");
    expect(src).toContain('onCheckout(r)');
  });
});
