import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/supabase/middleware', async () => {
  const { NextResponse } = await import('next/server');
  return {
    updateSession: vi.fn(async () => ({ response: NextResponse.next(), user: session.user })),
  };
});
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({}) }));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setProfileRole,
  jsonReq,
} from './helpers/supabase-mock';
import { PUT as MEM_PUT } from '@/app/api/members/[id]/route';
import { middleware } from '@/middleware';
import { __resetRateLimitStore, READ_SENSITIVE_LIMIT, LOGIN_LIMIT } from '@/lib/rate-limit';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MID = '11111111-1111-4111-8111-111111111111';
const ctx = { params: Promise.resolve({ id: MID }) };

function apiReq(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, init);
}

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  setProfileRole('admin');
  __resetRateLimitStore();
});

describe('issue #65 fines RLS + hardening', () => {
  it('(a) migrasi 0029 cabut anon + guard is_staff untuk agregat NULL + owner untuk member', () => {
    const sql = read('supabase/migrations/0029_issue65_fines_rls.sql');
    expect(sql).toMatch(/REVOKE[\s\S]*get_fines_total[\s\S]*FROM anon/i);
    expect(sql).toMatch(/p_member_id IS NULL/);
    expect(sql).toMatch(/public\.is_staff\(\)/);
    expect(sql).toMatch(/members[\s\S]*user_id[\s\S]*auth\.uid\(\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_fines_total\(uuid\) TO authenticated/);
    // search_books TETAP anon (katalog publik via anon key) — tidak dicabut di sini.
    expect(sql).not.toMatch(/REVOKE[\s\S]*search_books/i);
  });

  it('(b) konstanta rate-limit READ_SENSITIVE 100/mnt + LOGIN 5/15mnt', async () => {
    const rl = await import('@/lib/rate-limit');
    expect(rl.READ_SENSITIVE_LIMIT).toBe(100);
    expect(rl.READ_SENSITIVE_WINDOW_MS).toBe(60_000);
    expect(rl.LOGIN_LIMIT).toBe(5);
    expect(rl.LOGIN_WINDOW_MS).toBe(900_000);
    expect(READ_SENSITIVE_LIMIT).toBe(100);
    expect(LOGIN_LIMIT).toBe(5);
  });

  it('(c) GET sensitif di-rate-limit 100/mnt; GET non-sensitif bebas', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.65' };
    let last: Response | null = null;
    for (let i = 0; i <= READ_SENSITIVE_LIMIT; i++) {
      last = await middleware(apiReq('/api/loans', { method: 'GET', headers }));
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    const mw = read('src/middleware.ts');
    expect(mw).toContain('/api/loans');
    expect(mw).toContain('/api/fines');
    expect(mw).toContain('/api/members');
    expect(mw).toContain('/api/reservations');
    expect(mw).toContain('LOGIN_LIMIT');
    const free = await middleware(
      apiReq('/api/books', { method: 'GET', headers: { 'cf-connecting-ip': '198.51.100.65' } })
    );
    expect(free.status).toBe(200);
  });

  it('(c2) /login di-rate-limit 5/15mnt', async () => {
    const headers = { 'cf-connecting-ip': '192.0.2.65' };
    let last: Response | null = null;
    for (let i = 0; i <= LOGIN_LIMIT; i++) {
      last = await middleware(apiReq('/login', { method: 'GET', headers }));
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
  });

  it('(d) PUT member_code non-admin -> 403; admin lolos; duplikat isUuid tunggal', async () => {
    setProfileRole('librarian');
    setTable('members', { update: { data: { id: MID }, error: null } });
    const denied = await MEM_PUT(jsonReq('PUT', '/api/x', { member_code: 'AG-999' }), ctx);
    expect(denied.status).toBe(403);
    setProfileRole('admin');
    const ok = await MEM_PUT(jsonReq('PUT', '/api/x', { member_code: 'AG-999' }), ctx);
    expect(ok.status).toBe(200);
    const src = read('src/app/api/members/[id]/route.ts');
    const dups = src.match(/if \(!isUuid\(id\)\) return jsonError\('VALIDATION', 'ID anggota tidak valid/g) ?? [];
    expect(dups.length).toBe(3);
    expect(src).toContain('Hanya admin yang dapat mengubah member_code');
  });

  it('(e) loans GET memvalidasi fineRate finite sebelum interpolasi', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toMatch(/Number\.isFinite\(.*[fF]ineRate|Number\.isFinite\(rawRate\)/);
  });
});
