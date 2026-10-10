import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Isu #56 — gate kelayakan checkout: anggota berdenda / terlambat / over-limit
// ditolak 409 di POST /api/loans + POST /api/reservations; agregat tagihan &
// keterlambatan terlihat di daftar anggota.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as LOANS_POST } from '@/app/api/loans/route';
import { POST as RESERVATIONS_POST } from '@/app/api/reservations/route';
import { GET as MEMBERS_GET } from '@/app/api/members/route';
import {
  evaluateLoanEligibility,
  checkMemberLoanEligibility,
  MAX_ACTIVE_LOANS_DEFAULT,
  type SupabaseLike,
} from '@/lib/loan-eligibility';
import {
  installMockSupabase,
  resetMockDb,
  setRpc,
  setTable,
  setProfileRole,
  req,
  jsonReq,
} from './helpers/supabase-mock';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

const PAST = new Date(Date.now() - 3 * 86400_000).toISOString();
const FUTURE = new Date(Date.now() + 7 * 86400_000).toISOString();

const sb = () => (globalThis as unknown as { __mockSupabase: SupabaseLike }).__mockSupabase;

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  setProfileRole('admin');
});

describe('evaluateLoanEligibility (aturan murni #56)', () => {
  it('ELIG-01 anggota bersih (tanpa denda, tidak terlambat, di bawah batas) lolos', () => {
    const v = evaluateLoanEligibility({ activeLoans: 1, overdueLoans: 0, openFines: 0 }, 3);
    expect(v).toEqual({ eligible: true });
  });

  it('ELIG-02 denda belum lunas -> MEMBER_HAS_FINES dengan nominal pada pesan', () => {
    const v = evaluateLoanEligibility({ activeLoans: 0, overdueLoans: 0, openFines: 12500 }, 3);
    expect(v.eligible).toBe(false);
    if (v.eligible) return;
    expect(v.code).toBe('MEMBER_HAS_FINES');
    expect(v.message).toMatch(/tagihan denda Rp/);
    expect(v.message).toMatch(/12\.500/);
  });

  it('ELIG-03 pinjaman terlambat -> MEMBER_OVERDUE', () => {
    const v = evaluateLoanEligibility({ activeLoans: 2, overdueLoans: 1, openFines: 0 }, 3);
    expect(v.eligible).toBe(false);
    if (v.eligible) return;
    expect(v.code).toBe('MEMBER_OVERDUE');
    expect(v.message).toMatch(/terlambat/);
  });

  it('ELIG-04 mencapai batas pinjaman aktif -> MEMBER_LOAN_LIMIT (di bawah batas masih lolos)', () => {
    const atLimit = evaluateLoanEligibility({ activeLoans: 3, overdueLoans: 0, openFines: 0 }, 3);
    expect(atLimit.eligible).toBe(false);
    if (!atLimit.eligible) expect(atLimit.code).toBe('MEMBER_LOAN_LIMIT');
    const below = evaluateLoanEligibility({ activeLoans: 2, overdueLoans: 0, openFines: 0 }, 3);
    expect(below).toEqual({ eligible: true });
  });

  it('ELIG-05 batas non-valid jatuh ke default', () => {
    expect(MAX_ACTIVE_LOANS_DEFAULT).toBe(3);
    const v = evaluateLoanEligibility({ activeLoans: 3, overdueLoans: 0, openFines: 0 }, 0);
    expect(v.eligible).toBe(false);
  });

  it('ELIG-06 denda diutamakan atas keterlambatan pada pesan blokir', () => {
    const v = evaluateLoanEligibility({ activeLoans: 3, overdueLoans: 2, openFines: 900 }, 3);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.code).toBe('MEMBER_HAS_FINES');
  });
});

describe('checkMemberLoanEligibility (I/O + fail-closed)', () => {
  it('CHK-01 denda via RPC get_fines_total -> 409 MEMBER_HAS_FINES', async () => {
    setRpc('get_fines_total', { data: 25000, error: null });
    setTable('loans', { list: { data: [] } });
    const r = await checkMemberLoanEligibility(sb(), MID);
    expect(r.eligible).toBe(false);
    if (r.eligible) return;
    expect(r.code).toBe('MEMBER_HAS_FINES');
    expect(r.status).toBe(409);
  });

  it('CHK-02 loan terlambat -> 409 MEMBER_OVERDUE', async () => {
    setRpc('get_fines_total', { data: 0, error: null });
    setTable('loans', { list: { data: [{ due_at: PAST }, { due_at: FUTURE }] } });
    const r = await checkMemberLoanEligibility(sb(), MID);
    expect(r.eligible).toBe(false);
    if (r.eligible) return;
    expect(r.code).toBe('MEMBER_OVERDUE');
    expect(r.summary.overdueLoans).toBe(1);
  });

  it('CHK-03 RPC denda gagal -> fallback query fines', async () => {
    setRpc('get_fines_total', { data: null, error: { message: 'missing', code: '42883' } });
    setTable('loans', { list: { data: [] } });
    setTable('fines', {
      list: {
        data: [
          { amount: 5000, paid_amount: 1000 },
          { amount: 2000, paid_amount: 2000 },
        ],
      },
    });
    const r = await checkMemberLoanEligibility(sb(), MID);
    expect(r.eligible).toBe(false);
    if (r.eligible) return;
    expect(r.code).toBe('MEMBER_HAS_FINES');
    expect(r.summary.openFines).toBe(4000);
  });

  it('CHK-04 verifikasi gagal total -> fail-closed 500 MEMBER_CHECK_FAILED', async () => {
    setRpc('get_fines_total', { data: null, error: { message: 'boom' } });
    setTable('fines', { list: { error: { message: 'boom' } } });
    const r = await checkMemberLoanEligibility(sb(), MID);
    expect(r.eligible).toBe(false);
    if (r.eligible) return;
    expect(r.code).toBe('MEMBER_CHECK_FAILED');
    expect(r.status).toBe(500);
  });

  it('CHK-05 max_active_loans dari library_settings dipakai', async () => {
    setRpc('get_fines_total', { data: 0, error: null });
    setTable('loans', { list: { data: [{ due_at: FUTURE }] } });
    setTable('library_settings', { single: { data: { id: 1, max_active_loans: 1 } } });
    const r = await checkMemberLoanEligibility(sb(), MID);
    expect(r.eligible).toBe(false);
    if (r.eligible) return;
    expect(r.code).toBe('MEMBER_LOAN_LIMIT');
  });
});

describe('POST /api/loans — gate #56', () => {
  const post = (body: Record<string, unknown>) => LOANS_POST(jsonReq('POST', '/api/loans', body));

  function seedCleanMember() {
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setTable('loans', { list: { data: [] } });
    setRpc('get_fines_total', { data: 0, error: null });
  }

  it('LOAN-GATE-01 anggota bersih tetap bisa checkout (201)', async () => {
    seedCleanMember();
    setRpc('checkout_loan', { data: { id: 'L-1', status: 'borrowed' }, error: null });
    const res = await post({ member_id: MID, book_id: BID });
    expect(res.status).toBe(201);
  });

  it('LOAN-GATE-02 anggota berdenda -> 409 MEMBER_HAS_FINES (checkout RPC tak dipanggil)', async () => {
    seedCleanMember();
    setRpc('get_fines_total', { data: 15000, error: null });
    setRpc('checkout_loan', { data: { id: 'L-1' }, error: null });
    const res = await post({ member_id: MID, book_id: BID });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('MEMBER_HAS_FINES');
    expect(j.error.message).toMatch(/15\.000/);
  });

  it('LOAN-GATE-03 anggota dengan loan terlambat -> 409 MEMBER_OVERDUE', async () => {
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setTable('loans', { list: { data: [{ due_at: PAST }] } });
    setRpc('get_fines_total', { data: 0, error: null });
    const res = await post({ member_id: MID, book_id: BID });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('MEMBER_OVERDUE');
  });

  it('LOAN-GATE-04 anggota di batas pinjaman aktif -> 409 MEMBER_LOAN_LIMIT', async () => {
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setTable('loans', {
      list: { data: [{ due_at: FUTURE }, { due_at: FUTURE }, { due_at: FUTURE }] },
    });
    setRpc('get_fines_total', { data: 0, error: null });
    const res = await post({ member_id: MID, book_id: BID });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'MEMBER_LOAN_LIMIT'
    );
  });

  it('LOAN-GATE-05 verifikasi gagal -> 500 fail-closed, checkout tak jalan', async () => {
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setRpc('get_fines_total', { data: null, error: { message: 'boom' } });
    setTable('fines', { list: { error: { message: 'boom' } } });
    const res = await post({ member_id: MID, book_id: BID });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'MEMBER_CHECK_FAILED'
    );
  });
});

describe('POST /api/reservations — gate #56 (paritas dengan loans)', () => {
  const post = (body: Record<string, unknown>) =>
    RESERVATIONS_POST(jsonReq('POST', '/api/reservations', body));

  function seedClean() {
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setTable('books', { single: { data: { id: BID, is_active: true } } });
    setTable('loans', { list: { data: [] } });
    setRpc('get_fines_total', { data: 0, error: null });
  }

  it('RES-GATE-01 anggota bersih -> reservasi dibuat (201)', async () => {
    seedClean();
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(201);
  });

  it('RES-GATE-02 anggota berdenda -> 409 MEMBER_HAS_FINES (tak ada hold buku)', async () => {
    seedClean();
    setRpc('get_fines_total', { data: 7500, error: null });
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('MEMBER_HAS_FINES');
  });

  it('RES-GATE-03 anggota terlambat -> 409 MEMBER_OVERDUE', async () => {
    seedClean();
    setTable('loans', { list: { data: [{ due_at: PAST }] } });
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('MEMBER_OVERDUE');
  });

  it('RES-GATE-04 anggota di batas pinjaman -> 409 MEMBER_LOAN_LIMIT', async () => {
    seedClean();
    setTable('loans', {
      list: { data: [{ due_at: FUTURE }, { due_at: FUTURE }, { due_at: FUTURE }] },
    });
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'MEMBER_LOAN_LIMIT'
    );
  });
});

describe('GET /api/members — agregat kelayakan (#56)', () => {
  it('MEM-AGG-01 baris anggota membawa fines_total/active_loans/overdue_loans', async () => {
    setTable('members', {
      list: { data: [{ id: MID, member_code: 'AG-1', status: 'active' }], count: 1 },
    });
    setTable('loans', {
      list: {
        data: [
          { member_id: MID, due_at: PAST },
          { member_id: MID, due_at: FUTURE },
        ],
      },
    });
    setTable('fines', { list: { data: [{ member_id: MID, amount: 5000, paid_amount: 1000 }] } });
    const res = await MEMBERS_GET(req('/api/members'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { id: string; fines_total: number; active_loans: number; overdue_loans: number }[];
    };
    expect(j.data[0]?.fines_total).toBe(4000);
    expect(j.data[0]?.active_loans).toBe(2);
    expect(j.data[0]?.overdue_loans).toBe(1);
  });

  it('MEM-AGG-02 agregat gagal -> nilai 0, daftar tetap 200', async () => {
    setTable('members', {
      list: { data: [{ id: MID, member_code: 'AG-1', status: 'active' }], count: 1 },
    });
    setTable('loans', { list: { error: { message: 'boom' } } });
    setTable('fines', { list: { error: { message: 'boom' } } });
    const res = await MEMBERS_GET(req('/api/members'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { fines_total: number; active_loans: number; overdue_loans: number }[];
    };
    expect(j.data[0]?.fines_total).toBe(0);
    expect(j.data[0]?.active_loans).toBe(0);
    expect(j.data[0]?.overdue_loans).toBe(0);
  });
});

describe('penyimpanan & dokumentasi #56', () => {
  it('DOC-01 migrasi 0023 menambah max_active_loans (aditif, idempotent)', () => {
    const m = read('supabase/migrations/0023_loan_eligibility.sql');
    expect(m).toMatch(/ALTER TABLE public\.library_settings/);
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS max_active_loans/);
    expect(m).toMatch(/DEFAULT 3/);
  });

  it('DOC-02 openapi: 409 + kode baru terdocumentasi untuk loans & reservations', () => {
    const spec = read('openapi.yaml');
    for (const code of [
      'MEMBER_HAS_FINES',
      'MEMBER_OVERDUE',
      'MEMBER_LOAN_LIMIT',
      'MEMBER_CHECK_FAILED',
    ]) {
      expect(spec).toContain(code);
    }
    const loans = read('src/app/api/loans/route.ts');
    expect(loans).toContain("from '@/lib/loan-eligibility'");
    expect(loans).toContain('checkMemberLoanEligibility(supabase, member_id)');
    const reservations = read('src/app/api/reservations/route.ts');
    expect(reservations).toContain("from '@/lib/loan-eligibility'");
    expect(reservations).toContain('checkMemberLoanEligibility(supabase, targetMember)');
  });

  it('DOC-03 UI: anggota menampilkan tagihan/telat + aksi suspend; LoanForm blokir pra-submit', () => {
    const anggota = read('src/app/admin/anggota/page.tsx');
    expect(anggota).toContain('Tagihan');
    expect(anggota).toContain('fines_total');
    expect(anggota).toContain('overdue_loans');
    expect(anggota).toContain("onSetStatus(r.id, r.member_code, 'suspended')");
    const form = read('src/components/admin/LoanForm.tsx');
    expect(form).toContain('evaluateLoanEligibility');
    expect(form).toContain('memberBlock');
  });
});
