/**
 * src/lib/auth.ts — util role & sesi (docs/architecture.md §4).
 *
 * KEPUTUSAN MAPPING ROLE:
 * - Database/migrasi memakai: 'admin' | 'librarian' | 'member'.
 * - Dokumen arsitektur & kontrak memakai istilah Indonesia:
 *   'admin' | 'pustakawan' | 'anggota'.
 * - File ini MENERIMA KEDUANYA dan menormalisasi ke bentuk Indonesia:
 *     'librarian' -> 'pustakawan', 'member' -> 'anggota',
 *     'admin'/'pustakawan'/'anggota' tetap.
 * - Lapisan guard kanonis untuk semua route API: `requireStaff()`
 *   di src/lib/supabase/auth.ts — SATU-satunya guard role aplikasi.
 *   Guard duplikat kedua (nol pemanggil, bandingkan role di dua ruang
 *   semantik berbeda) DIHAPUS; kini `requireStaff` berdelegate ke
 *   predikat kanonis (`normalizeRole`, `roleAllowed`) di src/lib/roles.ts
 *   sehingga semua layer sepakat.
 */

import { createClient } from '@/lib/supabase/server';
import { type AppRole, normalizeRole } from '@/lib/roles';

// Re-export kanonis (issue #25): definisi role tinggal di src/lib/roles.ts —
// modul tanpa dependensi yang bisa dipakai middleware edge, guard API,
// halaman server, maupun komponen client.
export { normalizeRole, isStaffRole, isAdminRole, roleAllowed, STAFF_ROLES } from '@/lib/roles';
export type { DbRole, AppRole, StaffRole } from '@/lib/roles';

export type SessionUser = {
  supabase: ReturnType<typeof createClient>;
  user: { id: string; email?: string | null } & Record<string, unknown>;
  profile: { role: string } & Record<string, unknown>;
  /** Role ternormalisasi (kanonis Indonesia). */
  role: AppRole;
  /** Role mentah dari kolom profiles.role (mis. 'librarian'). */
  rawRole: string;
};

/**
 * Ambil user + profile + role ternormalisasi.
 * Mengembalikan null-user bila belum login (tidak melempar),
 * agar Server Component bisa redirect('/login') sendiri.
 */
export async function getSessionUser(): Promise<
  | SessionUser
  | {
      supabase: ReturnType<typeof createClient>;
      user: null;
      profile: null;
      role: null;
      rawRole: null;
    }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, role: null, rawRole: null };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const rawRole = (profile as { role?: string } | null)?.role ?? 'anggota';
  return {
    supabase,
    user: user as unknown as SessionUser['user'],
    profile: (profile ?? { role: rawRole }) as SessionUser['profile'],
    role: normalizeRole(rawRole),
    rawRole,
  };
}
