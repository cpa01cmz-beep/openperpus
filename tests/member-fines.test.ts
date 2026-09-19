import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// US-03: Denda transparan — anggota melihat + membayar dendanya sendiri.
// Mocks supabase server client via globalThis (vi.mock factory hoisted).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET } from '@/app/api/fines/route';
import { POST as PAY } from '@/app/api/fines/[id]/pay/route';

type FineRow = {
  id: string;
  loan_id: string;
  member_id: string;
  amount: number;
  paid_amount: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
};

function fineRow(partial: Partial<FineRow> & { id: string }): FineRow {
  return {
    loan_id: 'L-1',
    member_id: 'M-1',
    amount: 5000,
    paid_amount: 0,
    status: 'unpaid',
    issued_at: new Date().toISOString(),
    paid_at: null,
    notes: null,
    ...partial,
  };
}

function setMock(opts: {
  userId: string | null;
  role: string;
  ownMemberId: string | null;
  fines: FineRow[];
}) {
  const db: Record<string, FineRow> = {};
  for (const f of opts.fines) db[f.id] = { ...f };

  const tableChain = () => {
    const chain: Record<string, unknown> = {};
    const eqs: Array<[string, unknown]> = [];
    let idFilter: string | null = null;
    let isUpdate = false;
    let updatePayload: Record<string, unknown> | null = null;

    chain.select = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.range = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      if (col === 'id' && typeof val === 'string') idFilter = val;
      return chain;
    });
    chain.in = vi.fn(() => chain);
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      isUpdate = true;
      updatePayload = payload;
      return chain;
    });
    chain.single = vi.fn(async () => {
      if (isUpdate) {
        const cur = idFilter ? db[idFilter] : null;
        if (!cur) return { data: null, error: { message: 'not found' } };
        // CAS ala route: hanya unpaid|partial yang bisa diupdate
        if (cur.status !== 'unpaid' && cur.status !== 'partial') {
          return { data: null, error: { message: 'conflict' } };
        }
        const updated = { ...cur, ...(updatePayload ?? {}) } as FineRow;
        if (idFilter) db[idFilter] = updated;
        return { data: updated, error: null };
      }
      if (idFilter) return { data: db[idFilter] ?? null, error: null };
      return { data: null, error: null };
    });
    chain.maybeSingle = chain.single;
    // Await langsung (GET list) → filter eqs ala route
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      let rows = Object.values(db);
      for (const [col, val] of eqs) {
        if (col === 'member_id') rows = rows.filter((r) => r.member_id === val);
        if (col === 'status') rows = rows.filter((r) => r.status === val);
      }
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
    };
    return chain;
  };

  const profileEq = () => ({
    single: async () => ({ data: { role: opts.role }, error: null }),
    maybeSingle: async () => ({ data: { role: opts.role }, error: null }),
  });
  const memberEq = () => ({
    single: async () => ({ data: opts.ownMemberId ? { id: opts.ownMemberId } : null, error: null }),
    maybeSingle: async () => ({
      data: opts.ownMemberId ? { id: opts.ownMemberId } : null,
      error: null,
    }),
  });

  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: {
      getUser: async () =>
        opts.userId
          ? { data: { user: { id: opts.userId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => profileEq() }) };
      if (table === 'members') return { select: () => ({ eq: () => memberEq() }) };
      if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
      return tableChain();
    }),
  };
}

function getReq(url: string) {
  return new Request(url, { method: 'GET' });
}

function payReq(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/fines/${id}/pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('US-03 member fines — lihat + bayar sendiri', () => {
  beforeEach(() => {
    setMock({ userId: 'U-M1', role: 'member', ownMemberId: 'M-1', fines: [] });
  });

  it('anggota melihat denda milik sendiri (GET ?status=unpaid → 200 berisi F-1 Rp5000, tanpa milik orang lain)', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [
        fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000 }),
        fineRow({ id: 'F-9', member_id: 'M-2', amount: 9000 }),
      ],
    });
    const res = await GET(getReq('http://localhost/api/fines?status=unpaid'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: FineRow[] };
    const ids = (json.data ?? []).map((r) => r.id);
    expect(ids, 'anggota harus melihat F-1 miliknya').toContain('F-1');
    expect(ids, 'denda milik orang lain (F-9) tidak boleh bocor').not.toContain('F-9');
    const f1 = (json.data ?? []).find((r) => r.id === 'F-1');
    expect(Number(f1?.amount)).toBe(5000);
  });

  it('anggota melunasi milik sendiri via qris (POST → 200 paid + paid_at)', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [
        fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000, paid_amount: 0, status: 'unpaid' }),
      ],
    });
    const res = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(res.status, 'pemilik harus bisa membayar milik sendiri').toBe(200);
    const json = (await res.json()) as { data: FineRow };
    expect(json.data.status).toBe('paid');
    expect(json.data.paid_at, 'pelunasan harus mengisi paid_at').toBeTruthy();
  });

  it('parsial 2000 dari 5000 → partial sisa 3000', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [
        fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000, paid_amount: 0, status: 'unpaid' }),
      ],
    });
    const res = await PAY(payReq('F-1', { method: 'qris', amount: 2000 }), {
      params: { id: 'F-1' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: FineRow };
    expect(json.data.status).toBe('partial');
    expect(Number(json.data.paid_amount)).toBe(2000);
    expect(Number(json.data.amount) - Number(json.data.paid_amount), 'sisa harus 3000').toBe(3000);
  });

  it("overpay ditolak 422 'Nominal melebihi sisa denda (3000).'", async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [
        fineRow({
          id: 'F-1',
          member_id: 'M-1',
          amount: 5000,
          paid_amount: 2000,
          status: 'partial',
        }),
      ],
    });
    const res = await PAY(payReq('F-1', { method: 'qris', amount: 5000 }), {
      params: { id: 'F-1' },
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('Nominal melebihi sisa denda (3000).');
  });

  it('konkuren/idempoten: bayar 2x → 1x200 + 1x409', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [
        fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000, paid_amount: 0, status: 'unpaid' }),
      ],
    });
    const first = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(first.status).toBe(200);
    const second = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(second.status, 'bayar kedua atas denda yang sudah lunas harus 409').toBe(409);
  });

  it('M-1 membayar F-9 milik M-2 → 403/404', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [fineRow({ id: 'F-9', member_id: 'M-2', amount: 9000, status: 'unpaid' })],
    });
    const res = await PAY(payReq('F-9', { method: 'qris' }), { params: { id: 'F-9' } });
    expect([403, 404], 'anggota tidak boleh membayar denda orang lain').toContain(res.status);
  });

  it('regresi kasir petugas: librarian tetap bisa membayar denda orang lain', async () => {
    setMock({
      userId: 'U-LIB',
      role: 'librarian',
      ownMemberId: null,
      fines: [fineRow({ id: 'F-9', member_id: 'M-2', amount: 9000, status: 'unpaid' })],
    });
    const res = await PAY(payReq('F-9', { metode: 'tunai' }), { params: { id: 'F-9' } });
    expect(res.status, 'petugas harus tetap bisa memproses denda').toBe(200);
    const json = (await res.json()) as { data: FineRow };
    expect(json.data.status).toBe('paid');
  });

  it('calcFine tetap Rp1000/hari (5 hari telat = 5000, tepat waktu = 0)', async () => {
    const mod = (await import('@/lib/supabase/auth')) as {
      calcFine: (a: string, b: string) => number;
    };
    expect(mod.calcFine('2026-01-01', '2026-01-06')).toBe(5000);
    expect(mod.calcFine('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('CONC-03/04 tetap hijau: pay idempoten 409 + CAS, return clamp', () => {
    const pay = readFileSync(join(process.cwd(), 'src/app/api/fines/[id]/pay/route.ts'), 'utf8');
    expect(pay.includes('jsonError("CONFLICT"') || pay.includes("jsonError('CONFLICT'")).toBe(true);
    expect(pay.includes(', 409)')).toBe(true);
    expect(
      pay.includes('.in("status", ["unpaid", "partial"])') ||
        pay.includes(".in('status', ['unpaid', 'partial'])")
    ).toBe(true);
    expect(pay.includes('FINE-PAY-IDEMPOTENT')).toBe(true);
    const loans =
      readFileSync(join(process.cwd(), 'src/app/api/loans/route.ts'), 'utf8') +
      '\n' +
      readFileSync(join(process.cwd(), 'src/lib/loans-return.ts'), 'utf8');
    expect(loans.includes('Math.min(') && loans.includes('stock_total')).toBe(true);
    expect(loans.includes('RETURN-CLAMP')).toBe(true);
  });

  it("halaman anggota 'Denda Saya' tersedia dengan tombol Bayar tunai|transfer|qris", () => {
    const candidates = ['src/app/(public)/denda/page.tsx', 'src/app/denda/page.tsx'];
    const found = candidates.find((p) => existsSync(join(process.cwd(), p)));
    expect(found, 'halaman Denda Saya anggota belum ada (public denda page)').toBeTruthy();
    const src = readFileSync(join(process.cwd(), found as string), 'utf8');
    expect(src).toMatch(/Bayar/);
    expect(src).toMatch(/tunai/);
    expect(src).toMatch(/transfer/);
    expect(src).toMatch(/qris/);
  });
});
