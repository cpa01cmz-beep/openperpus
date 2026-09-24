import { createClient } from './server';
import { normalizeRole } from '@/lib/auth';

export type StaffRole = 'admin' | 'librarian';

/* SHIM: logika kanonis per-modul (tanpa perubahan perilaku).
 * jsonError -> http-error.ts, slugify -> slug.ts,
 * FINE_PER_DAY/calcFine/addDaysISO -> finecalc.ts, parsePaging -> paging.ts.
 * 31 importer tetap from '@/lib/supabase/auth' tanpa perubahan. */
export { jsonError, jsonErrorMsg } from '@/lib/http-error';
export { slugify } from '@/lib/slug';
export { FINE_PER_DAY, calcFine, addDaysISO } from '@/lib/finecalc';
export { parsePaging } from '@/lib/paging';

/**
 * Guard API kanonis (SATU lapisan guard role aplikasi — docs/architecture.md §4):
 * pastikan ada user login + profiles.role termasuk allowedRoles.
 * roles mengikuti migrasi 0001: 'admin' | 'librarian' | 'member'.
 * Perbandingan lewat normalizeRole() (lib/auth) — semantik role DB dan
 * label Indonesia dibandingkan di ruang yang sama; perilaku identik untuk
 * ketiga nilai CHECK 0001 (admin/librarian/member).
 * Mengembalikan { supabase, user, profile } jika lolos,
 * atau { errorResponse } jika gagal (langsung return dari route).
 */
export async function requireStaff(allowedRoles: StaffRole[] = ['admin', 'librarian']) {
  const { jsonError } = await import('@/lib/http-error');
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { errorResponse: jsonError('UNAUTHORIZED', 'Silakan login.', 401) };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return { errorResponse: jsonError('FORBIDDEN', 'Profil tidak ditemukan.', 403) };
  }

  const allowed = allowedRoles.map(normalizeRole);
  const role = normalizeRole((profile as { role: string }).role);
  if (!allowed.includes(role)) {
    return { errorResponse: jsonError('FORBIDDEN', 'Butuh peran admin/librarian.', 403) };
  }

  return { supabase, user, profile };
}
