import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// US-3 receipt: pay → struk + riwayat lunas di Denda Saya.
// API: reuse POST /api/fines/[id]/pay response (tanpa ubah API).
// UI: pola source (Modal role=dialog + 44px + role=alert) ala dialogs lane.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

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

function payReq(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/fines/${id}/pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const pageSrc = () =>
  readFileSync(join(process.cwd(), 'src/app/(public)/denda/page.tsx'), 'utf8');

describe('US-3 denda receipt — struk + riwayat lunas', () => {
  beforeEach(() => {
    setMock({ userId: 'U-M1', role: 'member', ownMemberId: 'M-1', fines: [] });
  });

  it('bayar lunas mengembalikan data struk: paid + paid_at + Sisa Rp0 + method di notes', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000, status: 'unpaid' })],
    });
    const res = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: FineRow };
    expect(json.data.status).toBe('paid');
    expect(json.data.paid_at, 'struk butuh paid_at').toBeTruthy();
    const sisa = Number(json.data.amount) - Number(json.data.paid_amount);
    expect(sisa, 'struk pelunasan Sisa Rp0').toBe(0);
    expect(String(json.data.notes ?? ''), 'struk mencatat method').toMatch(/qris/);
  });

  it('double-click: bayar 2x → 1x200 + 1x409 CONFLICT "Denda sudah lunas"', async () => {
    setMock({
      userId: 'U-M1',
      role: 'member',
      ownMemberId: 'M-1',
      fines: [fineRow({ id: 'F-1', member_id: 'M-1', amount: 5000, status: 'unpaid' })],
    });
    const first = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(first.status).toBe(200);
    const second = await PAY(payReq('F-1', { method: 'qris' }), { params: { id: 'F-1' } });
    expect(second.status).toBe(409);
    const json = (await second.json()) as { error: { code?: string; message: string } };
    expect(json.error.message).toMatch(/Denda sudah lunas/);
  });

  it('bayar sukses membuka struk role=dialog dengan nominal Rp + method + Sisa Rp0', () => {
    const src = pageSrc();
    expect(src.includes('<Modal'), 'struk harus reuse Modal (role=dialog)').toBe(true);
    expect(/Bukti|struk|receipt/i.test(src), 'struk butuh judul Bukti pembayaran').toBe(true);
    expect(src.includes('Sisa'), 'struk harus menampilkan Sisa Rp0').toBe(true);
    // Struk memakai data response pay: amount + method + paid_at
    expect(src.includes('methodUsed') || src.includes('receipt'), 'struk reuse pay response').toBe(
      true
    );
  });

  it('riwayat menampilkan status paid + paid_at id-ID + method setelah reload', () => {
    const src = pageSrc();
    expect(src.includes('paid'), 'riwayat butuh status paid').toBe(true);
    expect(
      src.includes('Lunas pada'),
      'riwayat butuh kolom paid_at (Lunas pada) dari pay response'
    ).toBe(true);
    expect(
      src.includes("toLocaleDateString('id-ID')") && /paid_at/.test(src),
      'paid_at wajib format id-ID'
    ).toBe(true);
    expect(/Metode|methodUsed|notes/.test(src), 'riwayat butuh kolom method').toBe(true);
  });

  it('filter status dipertahankan setelah bayar (tidak direset)', () => {
    const src = pageSrc();
    const start = src.indexOf('async function confirmPay');
    const end = src.indexOf('\n  return (', start);
    const confirmPay = src.slice(start, end > start ? end : undefined);
    expect(confirmPay.length).toBeGreaterThan(0);
    expect(confirmPay.includes('await load()'), 'pay harus reload riwayat').toBe(true);
    expect(
      /setStatus\(\s*['"]{2}\s*\)/.test(confirmPay),
      'filter tidak boleh direset setelah pay'
    ).toBe(false);
    expect(/setStatus\(/.test(confirmPay), 'confirmPay tidak boleh menyentuh filter').toBe(false);
  });

  it('"Salin bukti" menyalin id+amount+method+paid_at via clipboard', () => {
    const src = pageSrc();
    expect(src.includes('Salin bukti'), 'struk butuh tombol "Salin bukti"').toBe(true);
    expect(src.includes('clipboard'), 'salin harus via navigator.clipboard').toBe(true);
    expect(src.includes('writeText'), 'salin harus via writeText').toBe(true);
    const copyIdx = src.indexOf('writeText');
    const window_ = src.slice(Math.max(0, copyIdx - 600), copyIdx + 200);
    expect(window_.includes('receipt.id') || window_.includes('.id'), 'salinan memuat id').toBe(
      true
    );
    expect(
      window_.includes('methodUsed') || window_.includes('method'),
      'salinan memuat method'
    ).toBe(true);
    expect(window_.includes('paid_at'), 'salinan memuat paid_at').toBe(true);
  });

  it('double-click guard: tombol confirm disable-while-pending + cegah POST ganda', () => {
    const src = pageSrc();
    const confirmPay = src.slice(src.indexOf('async function confirmPay'));
    expect(
      /if\s*\([^)]*payingId/.test(confirmPay),
      'confirmPay harus early-return saat pending (satu POST)'
    ).toBe(true);
    const modalSection = src.slice(src.indexOf('Bayar denda'));
    expect(
      /disabled=\{[^}]*payingId/.test(modalSection),
      'tombol "Ya, bayar" harus disabled-while-pending 44px'
    ).toBe(true);
  });
});
