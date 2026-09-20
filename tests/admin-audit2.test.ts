import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-admin-audit2: (a) alias PUT /api/loans/[id] return path must audit
// activity_logs with retry (not silent); (b) collective PUT /api/loans?id=
// return path must audit activity_logs (not silent); (c) dashboard
// activeLoans query must be bounded with .limit().

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PUT as ALIAS_PUT } from '@/app/api/loans/[id]/route';
import { PUT as COLLECTIVE_PUT } from '@/app/api/loans/route';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type MockSupabase = Record<string, unknown>;

function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const LOAN_ROW = {
  id: 'L-1',
  status: 'borrowed',
  due_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  book_id: BID,
  member_id: MID,
};

// Shared return-path mock: loans select/update, books, fines, activity_logs.
function setReturnMock(opts: {
  loan?: Record<string, unknown> | null;
  auditResults?: Array<{ error: { message: string } | null }>;
  onAuditInsert?: (payload: Record<string, unknown>) => void;
}) {
  const loan = opts.loan === undefined ? LOAN_ROW : opts.loan;
  const auditResults = opts.auditResults ?? [{ error: null }];
  let auditCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
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
        if (isUpdate) return { data: { id: 'L-1', ...(payload ?? {}) }, error: null };
        return { data: loan, error: null };
      };
      chain.maybeSingle = chain.single;
      return chain;
    }
    if (table === 'books') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.update = () => {
        isUpdate = true;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate) return { data: null, error: null };
        return { data: { stock_available: 1, stock_total: 3 }, error: null };
      };
      return chain;
    }
    if (table === 'fines') return { insert: async () => ({ error: null }) };
    if (table === 'activity_logs')
      return {
        insert: async (payload: Record<string, unknown>) => {
          opts.onAuditInsert?.(payload);
          const r = auditResults[Math.min(auditCalls, auditResults.length - 1)] ?? { error: null };
          auditCalls += 1;
          return { error: r.error };
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
  return { from, getAuditCalls: () => auditCalls };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('S-admin-audit2 alias+collective audit + dashboard bound', () => {
  // --- error-contract exact codes (reuse reliability lane) ---
  it('(contract) alias PUT missing loan -> 404 NOT_FOUND exact', async () => {
    setReturnMock({ loan: null });
    const res = await ALIAS_PUT(putReq('http://localhost/api/loans/L-1', { action: 'return' }), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('NOT_FOUND');
  });

  it('(contract) collective PUT missing loan -> 404 NOT_FOUND exact', async () => {
    setReturnMock({ loan: null });
    const res = await COLLECTIVE_PUT(
      putReq('http://localhost/api/loans?id=L-1', { action: 'return' })
    );
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('NOT_FOUND');
  });

  // --- (a) alias PUT audit ---
  it('(a) alias PUT return inserts activity_logs with {fine}', async () => {
    const seen: Record<string, unknown>[] = [];
    setReturnMock({ onAuditInsert: (p) => seen.push(p) });
    const res = await ALIAS_PUT(putReq('http://localhost/api/loans/L-1', { action: 'return' }), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(200);
    expect(seen.length >= 1, 'S-AUDIT2 RED: alias PUT must insert activity_logs').toBe(true);
    const meta = (seen[0] as { metadata?: Record<string, unknown> }).metadata ?? {};
    expect(typeof meta.fine).toBe('number');
  });

  it('(a) alias PUT audit retries once then logs (not silent)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAuditCalls } = setReturnMock({
      auditResults: [{ error: { message: 'db down' } }, { error: null }],
    });
    const res = await ALIAS_PUT(putReq('http://localhost/api/loans/L-1', { action: 'return' }), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(200);
    expect(getAuditCalls()).toBe(2);
    errSpy.mockRestore();
  });

  it('(a) alias PUT audit is non-best-effort (retry + log)', () => {
    const src = read('src/app/api/loans/[id]/route.ts');
    const putBody = src.slice(
      src.indexOf('export async function PUT'),
      src.indexOf('export async function DELETE')
    );
    const helper = read('src/lib/loans-return.ts');
    expect(
      putBody.includes('best-effort'),
      'S-AUDIT2 RED: alias PUT still swallows audit silently'
    ).toBe(false);
    expect(
      helper.includes('best-effort'),
      'S-AUDIT2 RED: helper still swallows audit silently'
    ).toBe(false);
    expect(
      putBody + helper,
      'S-AUDIT2 RED: alias PUT must log audit failure (structured logger)'
    ).toMatch(/createLogger|audit\.activity_logs_retry/);
  });

  // --- (b) collective PUT audit ---
  it('(b) collective PUT return inserts activity_logs with {fine}', async () => {
    const seen: Record<string, unknown>[] = [];
    setReturnMock({ onAuditInsert: (p) => seen.push(p) });
    const res = await COLLECTIVE_PUT(
      putReq('http://localhost/api/loans?id=L-1', { action: 'return' })
    );
    expect(res.status).toBe(200);
    expect(seen.length >= 1, 'S-AUDIT2 RED: collective PUT must insert activity_logs').toBe(true);
    const meta = (seen[0] as { metadata?: Record<string, unknown> }).metadata ?? {};
    expect(typeof meta.fine).toBe('number');
  });

  it('(b) collective PUT audit retries once then logs (not silent)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAuditCalls } = setReturnMock({
      auditResults: [{ error: { message: 'db down' } }, { error: null }],
    });
    const res = await COLLECTIVE_PUT(
      putReq('http://localhost/api/loans?id=L-1', { action: 'return' })
    );
    expect(res.status).toBe(200);
    expect(getAuditCalls()).toBe(2);
    errSpy.mockRestore();
  });

  it('(b) collective PUT audit is non-best-effort (retry + log)', () => {
    const src = read('src/app/api/loans/route.ts') + '\n' + read('src/lib/loans-return.ts');
    expect(
      src.includes('activity_logs'),
      'S-AUDIT2 RED: collective PUT never writes activity_logs'
    ).toBe(true);
    expect(
      src.includes('createLogger') || src.includes('audit.activity_logs_retry'),
      'S-AUDIT2 RED: collective PUT must log audit failure (structured logger)'
    ).toBe(true);
  });

  // --- (c) dashboard queries bounded ---
  it('(c) dashboard loan queries are bounded (count-head or .limit())', () => {
    const src = read('src/app/admin/page.tsx');
    // All loan reads must be bounded: count-head (no rows) or explicit .limit().
    // Iteration 1 (2026-09-19): perf fix replaced unbounded activeLoans fetch
    // with count-exact-head + get_loans_per_day RPC; overdueQueue capped .limit(8).
    expect(src.includes('id,due_at'), 'S-AUDIT2: overdueQueue select missing').toBe(true);
    expect(src, 'S-AUDIT2: overdueQueue must be capped with .limit(8)').toMatch(
      /\.limit\(\s*8\s*\)/
    );
    expect(
      src.includes('count'),
      'S-AUDIT2: dashboard must use count-exact-head for aggregates'
    ).toBe(true);
    expect(
      src.includes('get_loans_per_day'),
      'S-AUDIT2: dashboard chart must use grouped RPC, not unbounded fetch'
    ).toBe(true);
  });
});
