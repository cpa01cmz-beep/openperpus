import { createClient } from './server';

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
 * Guard API: pastikan ada user login + profiles.role termasuk allowedRoles.
 * roles mengikuti migrasi 0001: 'admin' | 'librarian' | 'member'.
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

  if (!allowedRoles.includes((profile as { role: string }).role as StaffRole)) {
    return { errorResponse: jsonError('FORBIDDEN', 'Butuh peran admin/librarian.', 403) };
  }

  return { supabase, user, profile };
}
