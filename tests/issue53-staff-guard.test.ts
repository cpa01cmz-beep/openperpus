import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { resetMockDb, installMockSupabase, setAuthUser, setProfileRole, setTable, req } from './helpers/supabase-mock';

// Route representative: GET koleksi (staff-gated). GET [id] owner-access
// (ikut main: anggota pemilik lolos) — diuji terpisah di bawah.
import { GET as loansGET } from '@/app/api/loans/route';
import { GET as loanByIdGET } from '@/app/api/loans/[id]/route';

const CTX = { params: Promise.resolve({ id: 'L-1' }) };

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('issue #53 — route representative tolak anon/member, loloskan admin', () => {
  it.each([
    { name: 'GET /api/loans', run: () => loansGET(req('/api/x')) },
    { name: 'GET /api/loans/[id]', run: () => loanByIdGET(req('/api/x'), CTX) },
  ])('$name → 401 anon', async ({ run }) => {
    setAuthUser(null);
    const res = await run();
    expect(res.status).toBe(401);
  });

  it('GET /api/loans → 403 member (pesan guard kanonis)', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('member');
    const res = await loansGET(req('/api/x'));
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.message).toBe('Butuh peran admin/librarian.');
  });

  it('GET /api/loans/[id] owner-access (ikut main): pemilik 200, bukan pemilik 403', async () => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('member');
    setTable('members', { single: { data: { id: 'm-1' }, error: null } });
    setTable('loans', {
      single: { data: { id: 'L-1', members: { user_id: 'user-1' } }, error: null },
    });
    expect((await loanByIdGET(req('/api/x'), CTX)).status).toBe(200);
    setTable('loans', {
      single: { data: { id: 'L-1', members: { user_id: 'user-lain' } }, error: null },
    });
    const res = await loanByIdGET(req('/api/x'), CTX);
    expect(res.status).toBe(403);
  });

  it.each([
    { name: 'GET /api/loans', run: () => loansGET(req('/api/x')) },
    { name: 'GET /api/loans/[id]', run: () => loanByIdGET(req('/api/x'), CTX) },
  ])('$name → 200 admin', async ({ run }) => {
    setAuthUser({ id: 'user-1' });
    setProfileRole('admin');
    const res = await run();
    expect(res.status).toBe(200);
  });
});

describe('issue #53 — kontrak 1 query role (statis, tanpa runtime)', () => {
  it('layout TIDAK query profiles (percaya klaim middleware)', () => {
    const code = src('src/app/admin/layout.tsx');
    expect(code).not.toMatch(/from\(['"]profiles['"]\)/);
    expect(code).toMatch(/headers\(\)/);
    expect(code).toMatch(/x-role|ROLE_HEADER/);
    expect(code).toMatch(/isStaffRole/);
  });

  it('middleware men-strip klaim palsu klien lalu menaruh klaim hasil verifikasi', () => {
    const code = src('src/middleware.ts');
    expect(code).toMatch(/headers\.delete\(ROLE_HEADER\)/);
    expect(code).toMatch(/headers\.set\(ROLE_HEADER, role\)/);
    expect(code).toMatch(/from\(['"]profiles['"]\)/);
  });

  it('tidak ada lagi getSession() polos di route STAFF; sisa hanya di route anggota/owner', () => {
    const staffRoutes = ['src/app/api/loans/route.ts'];
    for (const f of staffRoutes) expect(src(f)).not.toMatch(/getSession/);
    for (const f of [
      'src/app/api/loans/[id]/route.ts',
      'src/app/api/fines/route.ts',
      'src/app/api/fines/[id]/route.ts',
      'src/app/api/fines/[id]/pay/route.ts',
      'src/app/api/reservations/route.ts',
      'src/app/api/reservations/[id]/route.ts',
    ]) {
      expect(src(f), `${f} member-capable (kontrak openapi), tetap getSession`).toMatch(
        /getSession/
      );
    }
  });

  it('guard seragam: tak ada lagi requireStaff([...]) eksplisit (default = admin|librarian)', () => {
    expect(src('src/lib/supabase/auth.ts')).toMatch(
      /export async function requireStaff\(allowedRoles: StaffRole\[\] = \[\.\.\.STAFF_ROLES\]\)/
    );
    const api = ['src/app/api/loans/route.ts', 'src/app/api/members/route.ts'];
    for (const f of api) {
      expect(src(f), `${f} masih ada varian eksplisit`).not.toMatch(
        /requireStaff\(\['admin', 'librarian'\]\)/
      );
    }
  });
});
