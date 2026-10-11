import { createClient } from './server';
import { roleAllowed, STAFF_ROLES } from '@/lib/roles';
import type { StaffRole } from '@/lib/roles';

/**
 * Predikat role kanonis (issue #25) — re-export dari src/lib/roles.ts
 * (modul tanpa dependensi: aman untuk middleware edge, guard API, halaman
 * server, dan komponen client). Semua perbandingan role lewat predikat ini;
 * cek role inline di route handler DILARANG.
 */
export { normalizeRole, isStaffRole, isAdminRole, roleAllowed } from '@/lib/roles';
export type { StaffRole } from '@/lib/roles';

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
 * Perbandingan lewat predikat kanonis di src/lib/roles.ts
 * (normalizeRole/roleAllowed) — semantik role DB dan label Indonesia
 * dibandingkan di ruang yang sama; perilaku identik untuk ketiga nilai
 * CHECK 0001 (admin/librarian/member).
 * Mengembalikan { supabase, user, profile } jika lolos,
 * atau { errorResponse } jika gagal (langsung return dari route).
 */
export async function requireStaff(allowedRoles: StaffRole[] = [...STAFF_ROLES]) {
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

  if (!roleAllowed((profile as { role: string }).role, allowedRoles)) {
    return { errorResponse: jsonError('FORBIDDEN', 'Butuh peran admin/librarian.', 403) };
  }

  return { supabase, user, profile };
}
