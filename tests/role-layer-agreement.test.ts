/**
 * tests/role-layer-agreement.test.ts — I5 RBAC + RLS 3-layer agreement.
 * Layer 1 (DB): 0019 guard trigger menolak perubahan profiles.role non-admin.
 * Layer 2 (app route): requireStaff kanonis berbasis normalizeRole;
 *   guard lama yang nol pemanggil (requireRole) harus hilang dari src/lib/auth.ts.
 * Layer 3 (edge): middleware mengecek profiles.role staff untuk /admin,
 *   sejajar dengan admin/layout.tsx.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('layer 1 — DB trigger guard (0019)', () => {
  it('0019_role_guard.sql ada: is_admin + IS DISTINCT FROM + RAISE EXCEPTION di profiles', () => {
    const p = join(process.cwd(), 'supabase/migrations/0019_role_guard.sql');
    expect(
      existsSync(p),
      'RED: supabase/migrations/0019_role_guard.sql absen — celah librarian→admin via UPDATE profiles.role masih terbuka (policy staff manage profiles 0002 + strip 0003 melewatkan is_staff)'
    ).toBe(true);
    const sql = readFileSync(p, 'utf8').toLowerCase();
    expect(sql, 'guard harus membandingkan OLD.role vs NEW.role').toContain(
      'old.role is distinct from new.role'
    );
    expect(sql, 'guard harus membatasi ke is_admin()').toContain('is_admin()');
    expect(sql, 'guard harus menolak dengan RAISE, bukan strip senyap').toContain(
      'raise exception'
    );
    expect(sql, 'guard harus berupa trigger pada public.profiles').toContain('create trigger');
    expect(sql).toContain('public.profiles');
  });

  it('guard trigger firing order: trg_0019_* sebelum trg_strip_* (alphabetical), keamanan tetap tanpa urutan', () => {
    // PostgreSQL men-fire trigger per event secara alfabetis.
    // Strip 0003 melewatkan aktor is_staff (lubangnya), jadi guard-lah yang
    // menutup; bila urutan terbalik pun strip bersifat netral-insecure
    // (revert senyap untuk non-staff), eskalasi tetap mustahil.
    expect('trg_0019_profiles_role_guard' < 'trg_strip_profiles_role').toBe(true);
    const guard = src('supabase/migrations/0019_role_guard.sql');
    expect(guard).toContain('trg_0019_profiles_role_guard');
  });

  it('guard dilewati hanya untuk konteks tanpa sesi (auth.uid() IS NULL) — seed/psql tetap jalan', () => {
    const sql = src('supabase/migrations/0019_role_guard.sql').toLowerCase();
    expect(sql).toContain('auth.uid() is null');
  });
});

describe('layer 2 — kanonis guard aplikasi', () => {
  it('guard mati (requireRole) dihapus dari src/lib/auth.ts — nol pemanggil, duplikat semantik', () => {
    expect(src('src/lib/auth.ts')).not.toMatch(/requireRole/);
  });

  it('requireStaff memakai normalizeRole — satu sumber semantik role untuk semua route', () => {
    const code = src('src/lib/supabase/auth.ts');
    expect(code).toMatch(/export async function requireStaff/);
    expect(code, 'requireStaff harus delegate ke normalizeRole (layer disepakati)').toMatch(
      /normalizeRole/
    );
  });

  it('normalizeRole memetakan ketiga nilai CHECK 0001 + label Indonesia + fallback anggota', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
    const { normalizeRole } = await import('@/lib/auth');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('librarian')).toBe('pustakawan');
    expect(normalizeRole('member')).toBe('anggota');
    expect(normalizeRole('pustakawan')).toBe('pustakawan');
    expect(normalizeRole('anggota')).toBe('anggota');
    expect(normalizeRole(null)).toBe('anggota');
    expect(normalizeRole('unknown')).toBe('anggota');
    vi.resetModules();
  });
});

describe('requireStaff behavior — admin/librarian/member identik', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function callWith(role: string | null, hasUser: boolean) {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(() => ({
        auth: {
          getUser: async () => ({
            data: { user: hasUser ? { id: 'u-1' } : null },
            error: hasUser ? null : { message: 'no session' },
          }),
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: async () =>
                role === null
                  ? { data: null, error: { message: 'no profile' } }
                  : { data: { role }, error: null },
            })),
          })),
        })),
      })),
    }));
    const { requireStaff } = await import('@/lib/supabase/auth');
    return requireStaff();
  }

  it('anon → 401 UNAUTHORIZED', async () => {
    const r = await callWith(null, false);
    expect('errorResponse' in r && r.errorResponse).toBeTruthy();
    const res = (r as { errorResponse: Response }).errorResponse;
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('member → 403 FORBIDDEN', async () => {
    const r = await callWith('member', true);
    expect('errorResponse' in r && r.errorResponse).toBeTruthy();
    const res = (r as { errorResponse: Response }).errorResponse;
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('librarian → lolos (staff)', async () => {
    const r = await callWith('librarian', true);
    expect('errorResponse' in r).toBe(false);
    expect((r as { profile: { role: string } }).profile.role).toBe('librarian');
  });

  it('admin → lolos (staff)', async () => {
    const r = await callWith('admin', true);
    expect('errorResponse' in r).toBe(false);
    expect((r as { profile: { role: string } }).profile.role).toBe('admin');
  });

  it('profil hilang → 403 FORBIDDEN (fail-closed)', async () => {
    const r = await callWith(null, true);
    expect('errorResponse' in r && r.errorResponse).toBeTruthy();
    const res = (r as { errorResponse: Response }).errorResponse;
    expect(res.status).toBe(403);
  });
});

describe('layer 3 — middleware staff gate /admin', () => {
  it('middleware mengecek profiles.role (admin|librarian) — non-staff redirect, fail-closed', () => {
    const code = src('src/middleware.ts');
    expect(code, 'middleware harus query profiles.role untuk /admin').toMatch(/profiles/);
    expect(code).toMatch(/librarian/);
    expect(code).toMatch(/isAdmin && user/);
  });

  it('admin/layout.tsx tetap mempertahankan role check (defense-in-depth antar layer)', () => {
    const code = src('src/app/admin/layout.tsx');
    expect(code).toMatch(/role !== "admin"/);
    expect(code).toMatch(/role !== "librarian"/);
  });
});
