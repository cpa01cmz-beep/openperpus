import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #57 — "Status overdue ganda: kolom vs komputasi bikin angka beda".
// Definisi terlambat jadi TURUNAN (satu sumber kebenaran):
//   overdue ⇔ status masih berjalan AND due_at < NOW()
// status=overdue / overdue=1 / tombol "Terlambat saja" wajib menghasilkan
// hasil yang sama, dan semua halaman menampilkan status efektif yang sama.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

import {
  ACTIVE_LOAN_STATUSES,
  LOAN_STATUSES,
  effectiveLoanStatus,
  isActiveLoanStatus,
  isLoanOverdue,
  isLoanStatus,
  loansListFilter,
} from '@/lib/loans-overdue';
import { GET as LOANS_GET } from '@/app/api/loans/route';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

type Filter = { kind: 'eq' | 'in' | 'lt'; col: string; val: unknown };

const NOW = new Date('2026-10-10T12:00:00.000Z');
const PAST = '2026-10-01T00:00:00.000Z';
const FUTURE = '2026-11-01T00:00:00.000Z';

let authUser: { id: string } | null = { id: 'U-ADMIN' };

/**
 * Mock yang MEREKAM filter query loans (beda dari helper bersama yang membuang
 * chain) supaya ekuivalen status=overdue ≡ overdue=1 bisa diuji secara nyata.
 */
function buildMock(rows: unknown[], finePerDay = 1500) {
  const filters: Filter[] = [];
  const client = {
    auth: {
      getUser: async () =>
        authUser
          ? { data: { user: { id: authUser.id } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
          }),
        };
      if (table === 'library_settings')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { fine_per_day: finePerDay }, error: null }),
            }),
          }),
        };
      // loans (+ tabel lain yang tak relevan untuk GET list)
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.order = () => c;
      c.range = () => c;
      c.ilike = () => c;
      c.eq = (col: string, val: unknown) => {
        filters.push({ kind: 'eq', col, val });
        return c;
      };
      c.in = (col: string, val: unknown) => {
        filters.push({ kind: 'in', col, val });
        return c;
      };
      c.lt = (col: string, val: unknown) => {
        filters.push({ kind: 'lt', col, val });
        return c;
      };
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null, count: rows.length }).then(res);
      return c;
    },
  };
  return { client, filters };
}

function install(rows: unknown[]) {
  const mock = buildMock(rows);
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock.client;
  return mock;
}

/** Timestamp `lt(due_at, …)` wajar beda antar-request — normalkan jadi marker. */
function normalize(filters: Filter[]): Filter[] {
  return filters.map((f) => (f.kind === 'lt' ? { ...f, val: '<ISO-NOW>' } : f));
}

describe('#57 helper — definisi turunan tunggal', () => {
  it('enum status loans konsisten dengan CHECK 0001_core.sql', () => {
    expect([...LOAN_STATUSES]).toEqual(['borrowed', 'returned', 'overdue', 'lost']);
    expect([...ACTIVE_LOAN_STATUSES]).toEqual(['borrowed', 'overdue']);
    expect(isLoanStatus('borrowed')).toBe(true);
    expect(isLoanStatus('overdue')).toBe(true);
    expect(isLoanStatus('hilang')).toBe(false);
    expect(isLoanStatus(undefined)).toBe(false);
    expect(isActiveLoanStatus('borrowed')).toBe(true);
    expect(isActiveLoanStatus('returned')).toBe(false);
    expect(isActiveLoanStatus(null)).toBe(false);
  });

  it('isLoanOverdue hanya untuk loan berjalan yang melewati tempo', () => {
    expect(isLoanOverdue({ status: 'borrowed', due_at: PAST }, NOW)).toBe(true);
    expect(isLoanOverdue({ status: 'overdue', due_at: PAST }, NOW)).toBe(true); // baris legacy
    expect(isLoanOverdue({ status: 'borrowed', due_at: FUTURE }, NOW)).toBe(false);
    expect(isLoanOverdue({ status: 'returned', due_at: PAST }, NOW)).toBe(false);
    expect(isLoanOverdue({ status: 'lost', due_at: PAST }, NOW)).toBe(false);
    expect(isLoanOverdue({ status: 'borrowed', due_at: 'bukan-tanggal' }, NOW)).toBe(false);
    expect(isLoanOverdue({ status: null, due_at: PAST }, NOW)).toBe(false);
  });

  it('effectiveLoanStatus: satu loan = satu status tampil', () => {
    expect(effectiveLoanStatus({ status: 'borrowed', due_at: PAST }, NOW)).toBe('overdue');
    expect(effectiveLoanStatus({ status: 'borrowed', due_at: FUTURE }, NOW)).toBe('borrowed');
    expect(effectiveLoanStatus({ status: 'returned', due_at: PAST }, NOW)).toBe('returned');
    expect(effectiveLoanStatus({ status: 'lost', due_at: FUTURE })).toBe('lost');
  });

  it('loansListFilter: status=overdue ≡ overdue=1 ≡ definisi turunan', () => {
    expect(loansListFilter({ status: 'overdue' })).toEqual({ overdue: true });
    expect(loansListFilter({ overdue: '1' })).toEqual({ overdue: true });
    expect(loansListFilter({ status: ' overdue ', overdue: null })).toEqual({ overdue: true });
    expect(loansListFilter({ status: 'borrowed' })).toEqual({ status: 'borrowed' });
    expect(loansListFilter({ status: 'lost' })).toEqual({ status: 'lost' });
    expect(loansListFilter({})).toEqual({});
    expect(loansListFilter({ overdue: '0', status: '' })).toEqual({});
    // 'overdue' tetap status enum yang sah (kompatibilitas baris lama) — di
    // route ia dipetakan ke definisi turunan, bukan eq kolom.
    expect(isLoanStatus('overdue')).toBe(true);
  });
});

describe('#57 GET /api/loans — filter kanonik terpasang', () => {
  it('status=overdue → in(status, aktif) + lt(due_at, now)', async () => {
    const mock = install([]);
    const res = await LOANS_GET(new Request('http://localhost/api/loans?status=overdue'));
    expect(res.status).toBe(200);
    expect(mock.filters).toEqual([
      { kind: 'in', col: 'status', val: [...ACTIVE_LOAN_STATUSES] },
      { kind: 'lt', col: 'due_at', val: expect.any(String) },
    ]);
  });

  it('overdue=1 menghasilkan filter yang sama dengan status=overdue', async () => {
    const a = install([]);
    await LOANS_GET(new Request('http://localhost/api/loans?status=overdue'));
    const viaStatus = normalize(a.filters);
    const b = install([]);
    await LOANS_GET(new Request('http://localhost/api/loans?overdue=1'));
    const viaFlag = normalize(b.filters);
    expect(viaFlag).toEqual(viaStatus);
  });

  it('status=borrowed tidak ikut memfilter tempo (hanya eq status)', async () => {
    const mock = install([]);
    const res = await LOANS_GET(new Request('http://localhost/api/loans?status=borrowed'));
    expect(res.status).toBe(200);
    expect(mock.filters).toEqual([{ kind: 'eq', col: 'status', val: 'borrowed' }]);
  });

  it('status di luar enum ditolak 422 VALIDATION (bukan list kosong)', async () => {
    install([]);
    const res = await LOANS_GET(new Request('http://localhost/api/loans?status=hilang'));
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error?: { code?: string } };
    expect(j.error?.code).toBe('VALIDATION');
  });

  it('tanpa session ditolak 401', async () => {
    authUser = null;
    try {
      install([]);
      const res = await LOANS_GET(new Request('http://localhost/api/loans'));
      expect(res.status).toBe(401);
    } finally {
      authUser = { id: 'U-ADMIN' };
    }
  });

  it('response membawa is_overdue + effective_status untuk status tampil tunggal', async () => {
    install([
      {
        id: 'L-1',
        status: 'borrowed',
        due_at: PAST,
        is_overdue: true,
        effective_status: 'overdue',
      },
      {
        id: 'L-2',
        status: 'borrowed',
        due_at: FUTURE,
        is_overdue: false,
        effective_status: 'borrowed',
      },
    ]);
    const res = await LOANS_GET(new Request('http://localhost/api/loans'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { id: string; effective_status?: string; is_overdue?: boolean }[];
    };
    expect(j.data.map((r) => r.effective_status)).toEqual(['overdue', 'borrowed']);
    expect(j.data.map((r) => r.is_overdue)).toEqual([true, false]);
  });

  it('route tetap memakai getFineRate + EPOCH/86400 untuk fine_preview', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toContain('getFineRate(');
    expect(src).toContain('EXTRACT(EPOCH FROM (NOW() - due_at))');
    expect(src).toContain('is_overdue');
    expect(src).toContain('effective_status');
    expect(src).toContain('loansListFilter');
    expect(src, 'status kolom yang ditulis checkout harus tetap borrowed').toContain(
      "status: 'borrowed'"
    );
  });
});

describe('#57 UI + docs — tidak ada lagi definisi ganda', () => {
  it('dropdown status admin tidak lagi menawarkan nilai overdue (tombol "Terlambat saja" saja)', () => {
    const src = read('src/app/admin/peminjaman/page.tsx');
    expect(src, 'dropdown status harus tetap ada').toContain('peminjaman-status');
    expect(src, 'RED: dropdown masih menawarkan option overdue').not.toContain(
      '<option value="overdue">'
    );
    // Deep link dari dashboard + toggle tetap jalan.
    expect(src).toContain("overdue: '1'");
    expect(src).toContain('Terlambat saja');
    expect(src).toContain('effectiveLoanStatus');
    // Status tampil kolom = status efektif, bukan kolom mentah.
    expect(src).toContain('render: (r) => statusOf(r)');
  });

  it('dashboard memakai status efektif untuk badge aktivitas', () => {
    const src = read('src/app/admin/page.tsx');
    expect(src).toContain('effectiveLoanStatus');
    expect(src, 'dashboard harus tetap deep-link ?overdue=1').toContain(
      '/admin/peminjaman?overdue=1'
    );
  });

  it('docs menyatakan overdue sebagai definisi turunan tunggal', () => {
    const contract = read('docs/api-contract.md');
    expect(contract).toContain("status IN ('borrowed','overdue')");
    expect(contract).toContain('effective_status');
    const db = read('docs/db-design.md');
    expect(db).toContain('TURUNAN');
    const spec = read('openapi.yaml');
    expect(spec).toContain('effective_status');
  });

  it('helper tunggal dipakai route (SQL) dan UI (JS)', () => {
    const route = read('src/app/api/loans/route.ts');
    expect(route).toContain("from '@/lib/loans-overdue'");
  });
});
