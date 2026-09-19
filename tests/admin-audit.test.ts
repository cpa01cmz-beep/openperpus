import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-admin-audit: POST /api/loans/[id]/return must audit activity_logs
// with metadata {fine,kondisi,book_id} (non-best-effort: log + retry once),
// and LogsTable must render an expandable metadata toggle.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as RETURN_POST } from '@/app/api/loans/[id]/return/route';

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

function postReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type MockSupabase = Record<string, unknown>;

function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function chainSingle(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.update = () => chain;
  chain.single = async () => ({ data, error: null });
  chain.maybeSingle = async () => ({ data, error: null });
  return chain;
}

// Return-path mock with capturable activity_logs inserts.
function setReturnAuditMock(opts: {
  loan?: Record<string, unknown> | null;
  auditResults?: Array<{ error: { message: string } | null }>;
  onAuditInsert?: (payload: Record<string, unknown>) => void;
}) {
  const loan = opts.loan ?? {
    id: 'L-1',
    status: 'borrowed',
    due_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    book_id: BID,
    member_id: MID,
  };
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
    return chainSingle(null);
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
  });
  return { from, getAuditCalls: () => auditCalls };
}

// Minimal mock for error-contract reuse (mirrors reliability lane).
function setReturnMock(loan: Record<string, unknown> | null) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
    if (table === 'loans')
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: loan, error: null }) }) }),
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
    from,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('S-admin-audit return audit + logs metadata', () => {
  // --- error-contract helper assertions reused from reliability lane (exact code match) ---
  it('return POST missing loan -> 404 NOT_FOUND exact', async () => {
    setReturnMock(null);
    const res = await RETURN_POST(postReq('http://localhost/api/loans/L-1/return', {}), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('NOT_FOUND');
  });

  it('return POST already returned -> 409 CONFLICT exact', async () => {
    setReturnMock({
      id: 'L-1',
      status: 'returned',
      due_at: new Date().toISOString(),
      book_id: BID,
      member_id: MID,
    });
    const res = await RETURN_POST(postReq('http://localhost/api/loans/L-1/return', {}), {
      params: { id: 'L-1' },
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('CONFLICT');
  });

  it('POST return inserts activity_logs with {fine,kondisi,book_id}', async () => {
    const seen: Record<string, unknown>[] = [];
    setReturnAuditMock({ onAuditInsert: (p) => seen.push(p) });
    const res = await RETURN_POST(
      postReq('http://localhost/api/loans/L-1/return', { kondisi: 'baik' }),
      {
        params: { id: 'L-1' },
      }
    );
    expect(res.status).toBe(200);
    expect(seen.length >= 1, 'S-AUDIT RED: POST return must insert activity_logs').toBe(true);
    const meta = (seen[0] as { metadata?: Record<string, unknown> }).metadata ?? {};
    expect(typeof meta.fine).toBe('number');
    expect(meta.kondisi).toBe('baik');
    expect(meta.book_id).toBe(BID);
  });

  it('audit insert retries once then surfaces via server log (no silent swallow)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAuditCalls } = setReturnAuditMock({
      auditResults: [{ error: { message: 'db down' } }, { error: null }],
    });
    const res = await RETURN_POST(
      postReq('http://localhost/api/loans/L-1/return', { kondisi: 'rusak' }),
      {
        params: { id: 'L-1' },
      }
    );
    expect(res.status).toBe(200);
    expect(getAuditCalls()).toBe(2);
    errSpy.mockRestore();
  });

  it('audit insert failing twice logs 500 detail (not silent)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setReturnAuditMock({
      auditResults: [{ error: { message: 'boom-500' } }, { error: { message: 'boom-500' } }],
    });
    const res = await RETURN_POST(
      postReq('http://localhost/api/loans/L-1/return', { kondisi: 'baik' }),
      {
        params: { id: 'L-1' },
      }
    );
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => String(c.join(' ')).toLowerCase()).join('\n');
    expect(
      logged.includes('activity_logs') || logged.includes('audit') || logged.includes('boom-500')
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('return route audit is non-best-effort (retry + log, no silent swallow)', () => {
    const src =
      read('src/app/api/loans/[id]/return/route.ts') + '\n' + read('src/lib/loans-return.ts');
    expect(src.includes('best-effort'), 'S-AUDIT RED: route still swallows audit silently').toBe(
      false
    );
    expect(src.includes('console.error'), 'S-AUDIT RED: route must log audit failure').toBe(true);
    expect(src.includes('metadata'), 'S-AUDIT RED: route must write metadata').toBe(true);
    expect(src.includes('book_id'), 'S-AUDIT RED: audit metadata must include book_id').toBe(true);
  });

  it('LogsTable renders metadata toggle', () => {
    const src = read('src/components/admin/LogsTable.tsx');
    expect(src.includes('metadata'), 'S-AUDIT RED: LogsTable drops metadata').toBe(true);
    expect(
      src.includes('<details') || src.includes('useState'),
      'S-AUDIT RED: LogsTable must render expandable metadata toggle'
    ).toBe(true);
  });

  it('logs page keeps metadata select', () => {
    const src = read('src/app/admin/logs/page.tsx');
    expect(src.includes('metadata'), 'S-AUDIT RED: logs page must keep metadata select').toBe(true);
  });
});
