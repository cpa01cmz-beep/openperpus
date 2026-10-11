import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installMockSupabase, resetMockDb } from './helpers/supabase-mock';

// Issue #74 — kebijakan pinjam jadi pengaturan, bukan hardcode.
//   1. checkout tempo default ikut library_settings.loan_days (bukan +14 mati),
//   2. batas + hitungan perpanjangan dari max_extensions/loans.extend_count,
//   3. return kondisi rusak/hilang tercatat + denda ganti rugi dari settings.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as LOANS_POST } from '@/app/api/loans/route';
import { PUT as LOANS_PUT } from '@/app/api/loans/[id]/route';
import { extendLoan, returnLoan } from '@/lib/loans-return';
import { replacementFeeFor, resolveLoanPolicy } from '@/lib/loan-settings';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';
const LID = '33333333-3333-4333-8333-333333333333';

type Captured = { fn: string; params: Record<string, unknown> };

function setGlobal(mock: Record<string, unknown>) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function singleChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.update = () => chain;
  chain.single = async () => ({ data, error: null });
  return chain;
}

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonReq(method: string, url: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// 0. Keputusan murni: resolveLoanPolicy / replacementFeeFor
// ---------------------------------------------------------------------------
describe('#74 resolveLoanPolicy (murni, tanpa I/O)', () => {
  it('POLICY-01 kolom absen -> default (14 hari, 2 perpanjangan, ganti rugi 0)', () => {
    expect(resolveLoanPolicy(null)).toEqual({
      loanDays: 14,
      maxExtensions: 2,
      replacementFeeDamaged: 0,
      replacementFeeLost: 0,
    });
    expect(resolveLoanPolicy({ id: 1, name: 'Perpus' })).toEqual(resolveLoanPolicy(null));
  });

  it('POLICY-02 nilai dari settings dipakai, string angka dikonversi', () => {
    const p = resolveLoanPolicy({
      loan_days: '21',
      max_extensions: 3,
      replacement_fee_damaged: 15000,
      replacement_fee_lost: 60000,
    });
    expect(p.loanDays).toBe(21);
    expect(p.maxExtensions).toBe(3);
    expect(p.replacementFeeDamaged).toBe(15000);
    expect(p.replacementFeeLost).toBe(60000);
  });

  it('POLICY-03 nilai mustahil dijepit ke rentang aman (tidak error)', () => {
    const p = resolveLoanPolicy({
      loan_days: 0,
      max_extensions: -5,
      replacement_fee_damaged: 'bukan-angka',
      replacement_fee_lost: -1,
    });
    expect(p.loanDays).toBe(1);
    expect(p.maxExtensions).toBe(0);
    expect(p.replacementFeeDamaged).toBe(0);
    expect(p.replacementFeeLost).toBe(0);
    expect(resolveLoanPolicy({ loan_days: 9999 }).loanDays).toBe(365);
    expect(resolveLoanPolicy({ max_extensions: 99 }).maxExtensions).toBe(10);
  });

  it('POLICY-04 replacementFeeFor: baik 0, rusak/hilang sesuai kolom', () => {
    const p = resolveLoanPolicy({ replacement_fee_damaged: 25000, replacement_fee_lost: 75000 });
    expect(replacementFeeFor('baik', p)).toBe(0);
    expect(replacementFeeFor('rusak', p)).toBe(25000);
    expect(replacementFeeFor('hilang', p)).toBe(75000);
    expect(replacementFeeFor('apa pun', p)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 1. Checkout: due_at default ikut library_settings.loan_days
// ---------------------------------------------------------------------------
function setCheckoutMock(opts: {
  settings?: Record<string, unknown> | null;
  captured?: Captured[];
}) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return singleChain({ role: 'admin' });
    if (table === 'members') return singleChain({ id: MID, status: 'active' });
    if (table === 'library_settings') return singleChain(opts.settings ?? null);
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.limit = async () => ({ data: [], error: null });
      return chain;
    }
    return singleChain(null);
  });
  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    opts.captured?.push({ fn, params });
    if (fn === 'get_fines_total') return { data: 0, error: null };
    if (fn === 'checkout_loan')
      return { data: { id: LID, status: 'borrowed', due_at: params.p_due_at }, error: null };
    return { data: null, error: null };
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
    rpc,
  });
}

describe('#74 checkout — tempo default dari settings', () => {
  it('LOANDAYS-01 loan_days=7 -> due_at = borrowed_at + 7 hari (bukan +14)', async () => {
    const captured: Captured[] = [];
    setCheckoutMock({ settings: { id: 1, loan_days: 7 }, captured });
    const res = await LOANS_POST(jsonReq('POST', '/api/loans', { member_id: MID, book_id: BID }));
    expect(res.status).toBe(201);
    const call = captured.find((c) => c.fn === 'checkout_loan');
    expect(call, 'checkout_loan harus dipanggil').toBeDefined();
    const borrowed = new Date(String(call!.params.p_borrowed_at)).getTime();
    const due = new Date(String(call!.params.p_due_at)).getTime();
    expect(Math.round((due - borrowed) / 86400000)).toBe(7);
  });

  it('LOANDAYS-02 settings kosong -> fallback 14 hari (perilaku lama)', async () => {
    const captured: Captured[] = [];
    setCheckoutMock({ settings: null, captured });
    const res = await LOANS_POST(jsonReq('POST', '/api/loans', { member_id: MID, book_id: BID }));
    expect(res.status).toBe(201);
    const call = captured.find((c) => c.fn === 'checkout_loan')!;
    const borrowed = new Date(String(call.params.p_borrowed_at)).getTime();
    const due = new Date(String(call.params.p_due_at)).getTime();
    expect(Math.round((due - borrowed) / 86400000)).toBe(14);
  });

  it('LOANDAYS-03 due_at eksplisit dari body tetap dihormati', async () => {
    const captured: Captured[] = [];
    setCheckoutMock({ settings: { id: 1, loan_days: 7 }, captured });
    const dueAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = await LOANS_POST(
      jsonReq('POST', '/api/loans', { member_id: MID, book_id: BID, due_at: dueAt })
    );
    expect(res.status).toBe(201);
    const call = captured.find((c) => c.fn === 'checkout_loan')!;
    expect(new Date(String(call.params.p_due_at)).toISOString()).toBe(dueAt);
  });
});

// ---------------------------------------------------------------------------
// 2. Extend: batas + hitungan dari max_extensions / loans.extend_count
// ---------------------------------------------------------------------------
function setExtendMock(opts: {
  loan: Record<string, unknown>;
  settings?: Record<string, unknown> | null;
  captured?: Captured[];
}) {
  const logs = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: async () => ({ count: 0, error: null }),
        }),
      }),
    }),
    insert: async () => ({ error: null }),
  }));
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return singleChain({ role: 'admin' });
    if (table === 'library_settings') return singleChain(opts.settings ?? null);
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      let payload: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        payload = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: { ...opts.loan, ...(payload ?? {}) }, error: null };
        return { data: opts.loan, error: null };
      };
      return chain;
    }
    if (table === 'activity_logs') return logs();
    return singleChain(null);
  });
  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    opts.captured?.push({ fn, params });
    return { data: null, error: { code: '42883', message: 'function not found' } };
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
    rpc,
  });
}

describe('#74 extend — extend_count kolom, bukan activity_logs', () => {
  const due = new Date('2026-03-01T00:00:00.000Z').toISOString();

  it('EXTENDCOUNT-01 extend_count=2 + max_extensions=2 -> 409 tanpa RPC/update', async () => {
    const captured: Captured[] = [];
    setExtendMock({
      loan: { id: LID, status: 'borrowed', due_at: due, extend_count: 2 },
      settings: { id: 1, max_extensions: 2 },
      captured,
    });
    const res = await extendLoan({ supabase: setGlobalExport(), id: LID, days: 7 });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('CONFLICT');
    expect(j.error.message).toMatch(/batas.*perpanjangan/i);
    expect(captured, 'tidak boleh ada panggilan RPC saat batas tercapai').toHaveLength(0);
  });

  it('EXTENDCOUNT-02 extend_count=1 (< batas) -> extend lanjut, hitungan jadi 2', async () => {
    const captured: Captured[] = [];
    setExtendMock({
      loan: { id: LID, status: 'borrowed', due_at: due, extend_count: 1 },
      settings: { id: 1, max_extensions: 2 },
      captured,
    });
    const res = await extendLoan({ supabase: setGlobalExport(), id: LID, days: 7 });
    // RPC 42883 -> fallback optimistic-lock (mock tanpa .rpc nyata)
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { extension_count: number; extend_count: number } };
    expect(j.data.extension_count).toBe(2);
    expect(j.data.extend_count).toBe(2);
    expect(captured.some((c) => c.fn === 'extend_loan')).toBe(true);
  });
});

function setGlobalExport(): unknown {
  return (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase;
}

// ---------------------------------------------------------------------------
// 3. Return: kondisi rusak/hilang + denda ganti rugi dari settings
// ---------------------------------------------------------------------------
function setReturnMock(opts: {
  loan: Record<string, unknown>;
  settings?: Record<string, unknown> | null;
  book?: { stock_available: number; stock_total: number };
  capture: { bookUpdate: Record<string, unknown> | null; finesInserts: unknown[] };
}) {
  const book = opts.book ?? { stock_available: 2, stock_total: 5 };
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return singleChain({ role: 'admin' });
    if (table === 'loans') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      let payload: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        payload = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: { ...opts.loan, ...(payload ?? {}) }, error: null };
        return { data: opts.loan, error: null };
      };
      return chain;
    }
    if (table === 'books') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        opts.capture.bookUpdate = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: { ...book, ...(opts.capture.bookUpdate ?? {}) }, error: null };
        return { data: book, error: null };
      };
      return chain;
    }
    if (table === 'fines') {
      return {
        insert: async (row: unknown) => {
          opts.capture.finesInserts.push(row);
          return { error: null };
        },
      };
    }
    if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
    if (table === 'library_settings') return singleChain(opts.settings ?? null);
    return singleChain(null);
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
  });
}

describe('#74 return — kondisi rusak/hilang menagih ganti rugi', () => {
  const dueAt = new Date();
  dueAt.setHours(0, 0, 0, 0);
  dueAt.setDate(dueAt.getDate() - 3);

  it('KONDISI-01 PUT action=return meneruskan kondisi + ganti rugi masuk denda', async () => {
    const capture = { bookUpdate: null as Record<string, unknown> | null, finesInserts: [] };
    setReturnMock({
      loan: {
        id: LID,
        status: 'borrowed',
        due_at: dueAt.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      settings: {
        id: 1,
        fine_per_day: 1000,
        replacement_fee_damaged: 25000,
        replacement_fee_lost: 75000,
      },
      capture,
    });
    const res = await LOANS_PUT(
      putReq(`http://localhost/api/loans/${LID}`, {
        action: 'return',
        kondisi: 'hilang',
      }),
      { params: Promise.resolve({ id: LID }) }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { status: string; fine_amount: number; notes: string };
    };
    expect(j.data.status).toBe('lost');
    // 3 hari x Rp1.000 + ganti rugi hilang Rp75.000
    expect(j.data.fine_amount).toBe(78000);
    expect(j.data.notes).toContain('Kondisi kembali: hilang');
    expect(j.data.notes).toContain('Biaya ganti rugi');
    // stok buku hilang: total berkurang 1
    expect((capture.bookUpdate as { stock_total: number }).stock_total).toBe(4);
    expect(capture.finesInserts).toHaveLength(1);
    expect((capture.finesInserts[0] as { amount: number }).amount).toBe(78000);
    expect((capture.finesInserts[0] as { notes: string }).notes).toContain(
      'Biaya ganti rugi (hilang)'
    );
  });

  it('KONDISI-02 return biasa (tanpa kondisi) tetap baik + tanpa biaya ganti rugi', async () => {
    const capture = { bookUpdate: null as Record<string, unknown> | null, finesInserts: [] };
    setReturnMock({
      loan: {
        id: LID,
        status: 'borrowed',
        due_at: dueAt.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      settings: {
        id: 1,
        fine_per_day: 1000,
        replacement_fee_damaged: 25000,
        replacement_fee_lost: 75000,
      },
      capture,
    });
    const res = await LOANS_PUT(putReq(`http://localhost/api/loans/${LID}`, { action: 'return' }), {
      params: Promise.resolve({ id: LID }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { status: string; fine_amount: number } };
    expect(j.data.status).toBe('returned');
    expect(j.data.fine_amount).toBe(3000);
    expect((capture.bookUpdate as { stock_available: number }).stock_available).toBe(3);
  });

  it('KONDISI-03 kondisi di luar enum ditolak 422', async () => {
    const capture = { bookUpdate: null as Record<string, unknown> | null, finesInserts: [] };
    setReturnMock({
      loan: {
        id: LID,
        status: 'borrowed',
        due_at: dueAt.toISOString(),
        book_id: BID,
        member_id: MID,
      },
      settings: { id: 1, fine_per_day: 1000 },
      capture,
    });
    const res = await returnLoan({
      supabase: setGlobalExport(),
      id: LID,
      kondisi: 'sobek',
    });
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// 4. Kontrak statis: migrasi + UI admin
// ---------------------------------------------------------------------------
describe('#74 kontrak statis (migrasi + UI)', () => {
  it('MIG-01 migrasi 0026 menambah kolom kebijakan + extend_count', () => {
    const mig = read('supabase/migrations/0026_loan_policy.sql');
    for (const col of [
      'loan_days',
      'max_extensions',
      'replacement_fee_damaged',
      'replacement_fee_lost',
      'extend_count',
    ]) {
      expect(mig, `RED: migrasi 0026 harus punya ${col}`).toContain(col);
    }
    expect(mig, 'RED: extend_loan harus menaikkan extend_count').toMatch(
      /extend_count\s*=\s*COALESCE\(extend_count,\s*0\)\s*\+\s*1/
    );
    expect(mig, 'RED: return_loan harus menghitung ganti rugi').toMatch(/replacement_fee_lost/);
  });

  it('UI-01 admin peminjaman menawarkan kondisi + mengirimnya', () => {
    const ui = read('src/app/admin/peminjaman/page.tsx');
    expect(ui, 'RED: modal return harus punya pilihan kondisi').toContain('return-kondisi');
    expect(ui, 'RED: return harus mengirim kondisi').toMatch(/kondisi:\s*returnKondisi/);
    expect(ui, 'RED: tetap pakai PUT transport tunggal').toMatch(/method:\s*['"]PUT['"]/);
  });

  it('UI-02 LoanForm memakai loanDays dari settings (bukan +14 mati)', () => {
    const form = read('src/components/admin/LoanForm.tsx');
    expect(form, 'RED: LoanForm harus menerima loanDays').toMatch(/loanDays/);
    expect(form, 'RED: preview tidak boleh hardcode +14 hari').not.toMatch(/getDate\(\)\s*\+\s*14/);
  });
});

// ---------------------------------------------------------------------------
// 5. Endpoint pengaturan: kolom kebijakan pinjam divalidasi, bukan diam-diam
// ---------------------------------------------------------------------------
describe('#74 PUT /api/settings — validasi kolom kebijakan pinjam', () => {
  beforeEach(() => {
    resetMockDb();
    installMockSupabase();
  });

  it('SET-01 nilai di luar rentang ditolak 422', async () => {
    const { PUT } = await import('@/app/api/settings/route');
    const bad: Record<string, unknown>[] = [
      { loan_days: 0 },
      { loan_days: 400 },
      { loan_days: 2.5 },
      { max_extensions: -1 },
      { max_extensions: 11 },
      { replacement_fee_lost: -5 },
      { replacement_fee_damaged: 'gratis' },
    ];
    for (const body of bad) {
      const res = await PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus Uji', ...body }));
      expect(res.status, `${JSON.stringify(body)} harus 422`).toBe(422);
    }
  });

  it('SET-02 nilai valid tersimpan dan terbaca balik', async () => {
    const { PUT } = await import('@/app/api/settings/route');
    const res = await PUT(
      jsonReq('PUT', '/api/settings', {
        name: 'Perpus Uji',
        loan_days: '21',
        max_extensions: 3,
        replacement_fee_damaged: 15000,
        replacement_fee_lost: 60000,
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: Record<string, unknown> };
    expect(j.data.loan_days).toBe(21);
    expect(j.data.max_extensions).toBe(3);
    expect(j.data.replacement_fee_damaged).toBe(15000);
    expect(j.data.replacement_fee_lost).toBe(60000);
  });
});
