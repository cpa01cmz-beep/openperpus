import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

// Issue #72 — SOP denda: kwitansi bernomor + waive ber-approval + plafon denda.
//   1. payments immutable + receipt_no unik untuk SETIAP pembayaran,
//   2. fine_waivers: alasan wajib + approver admin ≠ pengaju,
//   3. return_loan mematok denda keterlambatan ke library_settings.fine_max.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setAuthUser,
  setProfileRole,
  setRpc,
  jsonReq,
} from './helpers/supabase-mock';

import { POST as PAY } from '@/app/api/fines/[id]/pay/route';
import { POST as WAIVE } from '@/app/api/fines/[id]/waive/route';
import { POST as DECIDE } from '@/app/api/fines/waivers/[id]/decision/route';
import { capLateFine, resolveFineMax } from '@/lib/loan-settings';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const FINE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const fineCtx = { params: Promise.resolve({ id: FINE_ID }) };
const WAIVER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const waiverCtx = { params: Promise.resolve({ id: WAIVER_ID }) };

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

// ---------------------------------------------------------------------------
// 0. Keputusan murni: plafon denda
// ---------------------------------------------------------------------------
describe('#72 plafon denda (murni)', () => {
  it('CAP-01 resolveFineMax: absen/rusak/<=0 -> 0 (tanpa plafon)', () => {
    expect(resolveFineMax(null)).toBe(0);
    expect(resolveFineMax({})).toBe(0);
    expect(resolveFineMax({ fine_max: 'bukan-angka' })).toBe(0);
    expect(resolveFineMax({ fine_max: -5 })).toBe(0);
    expect(resolveFineMax({ fine_max: '25000' })).toBe(25000);
  });

  it('CAP-02 capLateFine: 0 = tanpa plafon; > 0 dijepit; di bawah dibiarkan', () => {
    expect(capLateFine(3000, 0)).toEqual({ fine: 3000, capped: false });
    expect(capLateFine(3000, 2500)).toEqual({ fine: 2500, capped: true });
    expect(capLateFine(1000, 2500)).toEqual({ fine: 1000, capped: false });
  });
});

// ---------------------------------------------------------------------------
// 1. pay: kwitansi payments untuk setiap pembayaran
// ---------------------------------------------------------------------------
describe('#72 pay — receipt_no selalu ada', () => {
  it('PAY-RCP-01 jalur RPC pay_fine_tx -> 200 + payment.receipt_no', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setTable('profiles', { single: { data: { role: 'admin' } } });
    setTable('fines', {
      single: {
        data: {
          id: FINE_ID,
          loan_id: 'L-1',
          member_id: 'M-1',
          amount: 5000,
          paid_amount: 0,
          status: 'unpaid',
        },
      },
    });
    setRpc('pay_fine_tx', {
      data: {
        fine: { id: FINE_ID, amount: 5000, paid_amount: 5000, status: 'paid', paid_at: 'now' },
        payment: { id: 'pay-1', receipt_no: 'RCP-20261011-000001', amount: 5000, method: 'qris' },
      },
      error: null,
    });
    const res = await PAY(
      jsonReq('POST', `/api/fines/${FINE_ID}/pay`, { method: 'qris' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { status: string };
      payment: { receipt_no: string } | null;
    };
    expect(j.data.status).toBe('paid');
    expect(j.payment?.receipt_no).toMatch(/^RCP-/);
  });

  it('PAY-RCP-02 fallback CAS: pembayaran sukses tetap menulis payments ber-receipt_no', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setTable('profiles', { single: { data: { role: 'admin' } } });
    setTable('fines', {
      single: {
        data: {
          id: FINE_ID,
          loan_id: 'L-1',
          member_id: 'M-1',
          amount: 5000,
          paid_amount: 0,
          status: 'unpaid',
        },
      },
    });
    const res = await PAY(
      jsonReq('POST', `/api/fines/${FINE_ID}/pay`, { method: 'tunai' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { status: string };
      payment: { receipt_no: string; fine_id: string; amount: number } | null;
    };
    expect(j.data.status).toBe('paid');
    expect(j.payment, 'kwitansi fallback harus tersimpan').not.toBeNull();
    expect(j.payment?.fine_id).toBe(FINE_ID);
    expect(j.payment?.amount).toBe(5000);
    expect(j.payment?.receipt_no).toMatch(/^RCP-/);
  });
});

// ---------------------------------------------------------------------------
// 2. waive request: alasan wajib + hanya staf
// ---------------------------------------------------------------------------
describe('#72 waive request — alasan wajib, staf saja', () => {
  it('WAIVE-01 alasan < 10 karakter -> 422 VALIDATION', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    const res = await WAIVE(
      jsonReq('POST', `/api/fines/${FINE_ID}/waive`, { reason: 'salah' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('VALIDATION');
  });

  it('WAIVE-02 anggota (non-staf) -> 403', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('member');
    const res = await WAIVE(
      jsonReq('POST', `/api/fines/${FINE_ID}/waive`, { reason: 'salah input tarif denda' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(403);
  });

  it('WAIVE-03 RPC sukses -> 201 + waiver requested', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('librarian');
    setRpc('request_fine_waiver', {
      data: {
        id: WAIVER_ID,
        fine_id: FINE_ID,
        status: 'requested',
        reason: 'salah input tarif denda',
      },
      error: null,
    });
    const res = await WAIVE(
      jsonReq('POST', `/api/fines/${FINE_ID}/waive`, { reason: 'salah input tarif denda' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { id: string; status: string } };
    expect(j.data.id).toBe(WAIVER_ID);
    expect(j.data.status).toBe('requested');
  });

  it('WAIVE-04 RPC konflik 25001 -> 409', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setRpc('request_fine_waiver', {
      data: null,
      error: { code: '25001', message: 'Sudah ada pengajuan pembebasan yang menunggu approval.' },
    });
    const res = await WAIVE(
      jsonReq('POST', `/api/fines/${FINE_ID}/waive`, { reason: 'salah input tarif denda' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(409);
  });

  it('WAIVE-05 fallback (RPC belum ada): tulis fine_waivers langsung -> 201', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setTable('fines', { single: { data: { id: FINE_ID, status: 'unpaid' } } });
    const res = await WAIVE(
      jsonReq('POST', `/api/fines/${FINE_ID}/waive`, { reason: 'salah input tarif denda' }),
      fineCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { fine_id: string; requested_by: string } };
    expect(j.data.fine_id).toBe(FINE_ID);
    expect(j.data.requested_by).toBe('user-1');
  });
});

// ---------------------------------------------------------------------------
// 3. decision: admin saja + approver ≠ pengaju
// ---------------------------------------------------------------------------
describe('#72 waive decision — admin saja, approver ≠ pengaju', () => {
  it('DECIDE-01 librarian -> 403 (hanya admin memutuskan)', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('librarian');
    const res = await DECIDE(
      jsonReq('POST', `/api/fines/waivers/${WAIVER_ID}/decision`, { approve: true }),
      waiverCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(403);
  });

  it('DECIDE-02 approve non-boolean -> 422', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    const res = await DECIDE(
      jsonReq('POST', `/api/fines/waivers/${WAIVER_ID}/decision`, { approve: 'ya' }),
      waiverCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(422);
  });

  it('DECIDE-03 self-approval (pengaju == approver) -> 403', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setTable('fine_waivers', {
      single: {
        data: {
          id: WAIVER_ID,
          fine_id: FINE_ID,
          status: 'requested',
          reason: 'salah input tarif denda',
          requested_by: 'user-1',
        },
      },
    });
    const res = await DECIDE(
      jsonReq('POST', `/api/fines/waivers/${WAIVER_ID}/decision`, { approve: true }),
      waiverCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { message: string } };
    expect(j.error.message).toMatch(/pengajunya sendiri/i);
  });

  it('DECIDE-04 admin lain approve -> 200 + denda jadi waived', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setTable('fine_waivers', {
      single: {
        data: {
          id: WAIVER_ID,
          fine_id: FINE_ID,
          status: 'requested',
          reason: 'salah input tarif denda',
          requested_by: 'admin-lain',
        },
      },
    });
    const res = await DECIDE(
      jsonReq('POST', `/api/fines/waivers/${WAIVER_ID}/decision`, { approve: true, note: 'ok' }),
      waiverCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { status: string; approved_by: string } };
    expect(j.data.status).toBe('approved');
    expect(j.data.approved_by).toBe('user-1');
  });

  it('DECIDE-05 RPC sukses -> 200 memakai hasil RPC', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    setRpc('decide_fine_waiver', {
      data: { id: WAIVER_ID, status: 'rejected', decision_note: 'kurang bukti' },
      error: null,
    });
    const res = await DECIDE(
      jsonReq('POST', `/api/fines/waivers/${WAIVER_ID}/decision`, { approve: false }),
      waiverCtx as { params: Promise<{ id: string }> }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { status: string } };
    expect(j.data.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// 4. Kontrak statis: migrasi + UI + kontrak API
// ---------------------------------------------------------------------------
describe('#72 kontrak statis (migrasi + UI)', () => {
  it('MIG-01 migrasi 0027: payments immutable + receipt_no unik + sequence', () => {
    const mig = read('supabase/migrations/0027_fines_sop.sql');
    expect(mig, 'tabel payments wajib ada').toMatch(/CREATE TABLE IF NOT EXISTS public\.payments/);
    expect(mig, 'receipt_no UNIQUE wajib ada').toMatch(/uq_payments_receipt_no/);
    expect(mig, 'payments immutable wajib trigger blokir UPDATE/DELETE').toMatch(
      /payments_immutable/
    );
    expect(mig, 'sequence nomor kwitansi').toMatch(/payment_receipt_seq/);
    expect(mig, 'pay_fine_tx wajib ada').toMatch(/CREATE OR REPLACE FUNCTION public\.pay_fine_tx/);
  });

  it('MIG-02 migrasi 0027: fine_waivers + segregation of duties', () => {
    const mig = read('supabase/migrations/0027_fines_sop.sql');
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS public\.fine_waivers/);
    expect(mig, 'alasan wajib minimal 10 karakter').toMatch(/length\(btrim\(reason\)\) >= 10/);
    expect(mig, 'approver wajib beda dari pengaju').toMatch(
      /fine_waivers_approver_diff[\s\S]*approved_by <> requested_by/
    );
    expect(mig).toMatch(/request_fine_waiver/);
    expect(mig).toMatch(/decide_fine_waiver/);
    expect(mig, 'hanya admin yang memutuskan').toMatch(/IF NOT public\.is_admin\(\)/);
  });

  it('MIG-03 migrasi 0027: return_loan mematok denda telat ke fine_max', () => {
    const mig = read('supabase/migrations/0027_fines_sop.sql');
    expect(mig, 'kolom fine_max wajib ada').toMatch(/ADD COLUMN IF NOT EXISTS fine_max/);
    expect(mig, 'denda telat dijepit fine_max').toMatch(
      /v_fine_max > 0 AND v_late_fine > v_fine_max/
    );
    expect(mig, 'penanda plafon di notes').toMatch(/Denda dipatok maksimum/);
  });

  it('UI-01 admin denda: Modal (bukan confirm/alert), alasan waive, approval, kwitansi', () => {
    const ui = read('src/app/admin/denda/page.tsx');
    expect(ui, 'tidak boleh ada confirm() native').not.toMatch(/confirm\(/);
    expect(ui, 'tidak boleh ada alert() native').not.toMatch(/alert\(/);
    expect(ui, 'Modal wajib dipakai').toContain('<Modal');
    expect(ui, 'alasan waive minimal 10').toContain('REASON_MIN = 10');
    expect(ui, 'tombol ajukan pembebasan').toContain('Bebaskan');
    expect(ui, 'tombol putusan').toContain('Setujui');
    expect(ui, 'endpoint waive').toContain('/api/fines/${f.id}/waive');
    expect(ui, 'endpoint decision').toContain('/api/fines/waivers/${d.waiver.id}/decision');
    expect(ui, 'kwitansi dari payments').toContain('receiptNo');
    // total tetap via RPC (bukan reduce klien) — kontrak lama
    expect(ui).toMatch(/\.rpc\(['"]get_fines_total['"]/);
    expect(ui).not.toMatch(/\.reduce\(/);
  });

  it('UI-02 denda publik: receipt menampilkan nomor struk', () => {
    const ui = read('src/app/(public)/denda/page.tsx');
    expect(ui, 'nomor struk di struk').toContain('Nomor struk');
    expect(ui, 'receipt_no dari response pay').toMatch(/receiptNo/);
    expect(ui, 'baca payment dari response').toContain('.payment');
  });

  it('API-01 pay route memakai pay_fine_tx + menulis receipt_no', () => {
    const route = read('src/app/api/fines/[id]/pay/route.ts');
    expect(route).toContain("'pay_fine_tx'");
    expect(route, 'kwitansi ditulis ke payments').toMatch(/from\('payments'\)/);
    expect(route, 'response memuat payment').toContain('payment, revalidated');
  });

  it('API-02 openapi.yaml mendeklarasikan endpoint waive + decision (BearerAuth)', () => {
    const spec = parse(read('openapi.yaml')) as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };
    expect(spec.paths['/api/fines/{id}/waive']?.post).toBeDefined();
    expect(spec.paths['/api/fines/waivers/{id}/decision']?.post).toBeDefined();
    expect(spec.paths['/api/fines/{id}/waive'].post.security).toEqual([{ BearerAuth: [] }]);
    expect(spec.paths['/api/fines/waivers/{id}/decision'].post.security).toEqual([
      { BearerAuth: [] },
    ]);
  });
});
