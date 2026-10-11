/**
 * tests/issue25-centralized-roles.test.ts — issue #25.
 *
 * Gherkin issue: signed-in non-staff → 403 di SETIAP endpoint admin-only.
 * Matrix runtime 49 endpoint+method ada di tests/admin-staff-guard.test.ts
 * (tetap hijau tak berubah oleh PR ini).
 *
 * Fokus file ini — "centralize" yang tersisa:
 * 1. Predikat role kanonis hidup di SATU modul tanpa dependensi
 *    (src/lib/roles.ts) yang bisa dipakai middleware edge, guard API,
 *    halaman server, dan komponen client.
 * 2. Re-export dari @/lib/auth + @/lib/supabase/auth tetap identik
 *    (referensi fungsi sama — bukan duplikat semantik).
 * 3. Nol cek role inline di luar src/lib/roles.ts.
 * 4. Kebijakan per-rute yang LEBIH sempit (admin-only) memakai predikat
 *    kanonis: PUT /api/settings/theme librarian → 403 THEME_FORBIDDEN.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Modul roles.ts tanpa dependensi — aman diimpor langsung tanpa mock.
import { isAdminRole, isStaffRole, normalizeRole, roleAllowed, STAFF_ROLES } from '@/lib/roles';

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('issue #25 — predikat role kanonis (src/lib/roles.ts)', () => {
  it('normalizeRole memetakan nilai CHECK 0001 + label Indonesia, fail-closed', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('librarian')).toBe('pustakawan');
    expect(normalizeRole('member')).toBe('anggota');
    expect(normalizeRole('pustakawan')).toBe('pustakawan');
    expect(normalizeRole('anggota')).toBe('anggota');
    expect(normalizeRole(null)).toBe('anggota');
    expect(normalizeRole(undefined)).toBe('anggota');
    expect(normalizeRole('superuser')).toBe('anggota');
  });

  it('isStaffRole: admin/librarian/pustakawan staf; member/anggota/null/tak-dikenal tidak', () => {
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('librarian')).toBe(true);
    expect(isStaffRole('pustakawan')).toBe(true);
    expect(isStaffRole('member')).toBe(false);
    expect(isStaffRole('anggota')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole('root')).toBe(false);
  });

  it('isAdminRole: hanya admin; librarian/pustakawan/member/anggota ditolak', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('librarian')).toBe(false);
    expect(isAdminRole('pustakawan')).toBe(false);
    expect(isAdminRole('member')).toBe(false);
    expect(isAdminRole('anggota')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it('roleAllowed menghormati subset per-route (fail-closed)', () => {
    expect(roleAllowed('admin', ['admin'])).toBe(true);
    expect(roleAllowed('librarian', ['admin'])).toBe(false);
    expect(roleAllowed('pustakawan', ['admin', 'librarian'])).toBe(true);
    expect(roleAllowed('anggota', ['admin', 'librarian'])).toBe(false);
    expect(roleAllowed(null, ['admin', 'librarian'])).toBe(false);
  });

  it('STAFF_ROLES = admin|librarian — mirror public.is_staff() (0002_rls.sql)', () => {
    expect([...STAFF_ROLES].sort()).toEqual(['admin', 'librarian']);
  });
});

describe('issue #25 — re-export bukan duplikat semantik', () => {
  it('modul roles.ts tidak mengimpor apa pun (aman edge + client)', () => {
    const code = src('src/lib/roles.ts');
    const importLines = code
      .split('\n')
      .filter((l) => /^\s*import\b/.test(l))
      .filter((l) => !l.trim().startsWith('*'));
    expect(importLines, 'roles.ts harus bebas dependensi agar bisa dipakai client/edge').toEqual(
      []
    );
  });

  it('referensi fungsi identik lintas @/lib/roles, @/lib/auth, @/lib/supabase/auth', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }));
    vi.doMock('server-only', () => ({}));
    const roles = await import('@/lib/roles');
    const auth = await import('@/lib/auth');
    const guard = await import('@/lib/supabase/auth');
    // Satu sumber: re-export, bukan implementasi kedua.
    expect(auth.normalizeRole).toBe(roles.normalizeRole);
    expect(auth.isStaffRole).toBe(roles.isStaffRole);
    expect(auth.isAdminRole).toBe(roles.isAdminRole);
    expect(guard.normalizeRole).toBe(roles.normalizeRole);
    expect(guard.isStaffRole).toBe(roles.isStaffRole);
    expect(guard.isAdminRole).toBe(roles.isAdminRole);
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('server-only');
    vi.resetModules();
  });
});

describe('issue #25 — nol cek role inline di luar src/lib/roles.ts', () => {
  const forbidden: Array<{ name: string; re: RegExp }> = [
    {
      name: "role === 'admin' / role !== 'librarian' (dst)",
      re: /\b(?:role|rawRole)\s*(?:===|!==)\s*['"](?:admin|librarian|pustakawan|member|anggota)['"]/,
    },
    {
      name: "'admin' === role / 'librarian' !== role",
      re: /['"](?:admin|librarian|pustakawan|member|anggota)['"]\s*(?:===|!==)\s*(?:role|rawRole)\b/,
    },
    {
      name: "normalizeRole(x) === 'admin'",
      re: /normalizeRole\([^)]*\)\s*(?:===|!==)/,
    },
  ];

  it('sweep src/ tidak menemukan perbandingan role inline (kecuali modul kanonis)', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const rel = file.replace(`${process.cwd()}/`, '');
      if (rel === 'src/lib/roles.ts') continue; // satu-satunya tempat definisi
      const code = readFileSync(file, 'utf8');
      for (const { name, re } of forbidden) {
        const m = re.exec(code);
        if (m) offenders.push(`${rel}: ${name} -> ${m[0].trim()}`);
      }
    }
    expect(offenders, 'semua cek role wajib lewat predikat @/lib/roles').toEqual([]);
  });

  it('keempat titik bekas cek inline kini memakai predikat kanonis', () => {
    // 1. middleware gate /admin (edge).
    const mw = src('src/middleware.ts');
    expect(mw).toMatch(/import \{ isStaffRole \} from '@\/lib\/roles'/);
    expect(mw).toMatch(/!isStaffRole\(role\)/);
    // 2. PUT /api/settings/theme (admin-only policy).
    const theme = src('src/app/api/settings/theme/route.ts');
    expect(theme).toMatch(/import \{ isAdminRole \} from '@\/lib\/roles'/);
    expect(theme).toMatch(/!isAdminRole\(profile\?\.role\)/);
    // 3. halaman logs (RSC, admin-only).
    const logs = src('src/app/admin/logs/page.tsx');
    expect(logs).toMatch(/import \{ isAdminRole \} from '@\/lib\/roles'/);
    expect(logs).toMatch(/!isAdminRole\(role\)/);
    // 4. halaman denda (client, aturan approver ≠ pengaju).
    const denda = src('src/app/admin/denda/page.tsx');
    expect(denda).toMatch(/import \{ isAdminRole \} from '@\/lib\/roles'/);
    expect(denda).toMatch(/isAdminRole\(role\)/);
  });

  it('lib/auth + supabase/auth mendelegasikan ke @/lib/roles (bukan definisi ulang)', () => {
    expect(src('src/lib/auth.ts')).toMatch(/from '@\/lib\/roles'/);
    expect(src('src/lib/auth.ts')).not.toMatch(/export function normalizeRole/);
    expect(src('src/lib/supabase/auth.ts')).toMatch(/from '@\/lib\/roles'/);
    expect(src('src/lib/supabase/auth.ts')).not.toMatch(/export function isStaffRole/);
    expect(src('src/lib/supabase/auth.ts')).not.toMatch(/export type StaffRole/);
  });
});

// --- Runtime: kebijakan per-route yang lebih sempit lewat predikat kanonis ---
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// theme-overrides.ts mengimpor 'server-only' (modul server).
vi.mock('server-only', () => ({}));

import { PUT as settingsThemePUT } from '@/app/api/settings/theme/route';

function setSession(user: { id: string } | null, role: string | null): void {
  const profiles = {
    select: () => ({
      eq: () => ({
        single: async () =>
          role === null
            ? { data: null, error: { message: 'no profile' } }
            : { data: { role }, error: null },
      }),
    }),
  };
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'no session' },
      }),
    },
    from: (table: string) => (table === 'profiles' ? profiles : { select: () => ({}) }),
  };
}

const themeReq = (): Request =>
  new Request('http://localhost/api/settings/theme', {
    method: 'PUT',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });

describe('issue #25 — PUT /api/settings/theme: staf lolos guard, admin-only lewat predikat', () => {
  it('member → 403 FORBIDDEN dari requireStaff (matrix guard)', async () => {
    setSession({ id: 'U-MEMBER' }, 'member');
    const res = await settingsThemePUT(themeReq());
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('FORBIDDEN');
  });

  it('anon → 401 UNAUTHORIZED', async () => {
    setSession(null, null);
    const res = await settingsThemePUT(themeReq());
    expect(res.status).toBe(401);
  });

  it('librarian (staf) → 403 THEME_FORBIDDEN dari predikat isAdminRole', async () => {
    setSession({ id: 'U-LIB' }, 'librarian');
    const res = await settingsThemePUT(themeReq());
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('THEME_FORBIDDEN');
    expect(j.error.message).toBe('Hanya admin yang dapat mengubah tema.');
  });

  it('pustakawan (label Indonesia) → 403 THEME_FORBIDDEN — semantik konsisten', async () => {
    setSession({ id: 'U-PUSTAKAWAN' }, 'pustakawan');
    const res = await settingsThemePUT(themeReq());
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('THEME_FORBIDDEN');
  });

  it('admin → lolos guard + predikat admin (422 body kosong, bukan 403)', async () => {
    setSession({ id: 'U-ADMIN' }, 'admin');
    const res = await settingsThemePUT(themeReq());
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('VALIDATION');
  });
});
