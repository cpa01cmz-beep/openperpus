/**
 * src/lib/roles.ts — predikat role KANONIS (issue #25).
 *
 * Satu-sumber semantik role untuk SEMUA lapisan:
 * - edge middleware (src/middleware.ts),
 * - guard API (src/lib/supabase/auth.ts — requireStaff),
 * - halaman/komponen (admin/layout.tsx, admin/logs, admin/denda — server &
 *   client).
 *
 * Modul ini TANPA dependensi (tak mengimpor apa pun) supaya aman di bundle
 * client maupun runtime edge middleware. Cek role inline
 * (`role === 'admin'`, `role !== 'librarian'`, `normalizeRole(x) !== 'admin'`)
 * DIHARANKAN di luar file ini — pakai predikat di bawah sebagai gantinya.
 */

/** Role pada kolom profiles.role (migrasi 0001 CHECK). */
export type DbRole = 'admin' | 'librarian' | 'member';

/** Role kanonis setelah normalisasi (istilah Indonesia, docs/architecture.md). */
export type AppRole = 'admin' | 'pustakawan' | 'anggota';

/** Alias tipe untuk guard API (kompatibilitas importer lama). */
export type StaffRole = 'admin' | 'librarian';

/** Role staf default — mirror public.is_staff() (0002_rls.sql). */
export const STAFF_ROLES: readonly StaffRole[] = ['admin', 'librarian'];

/**
 * Normalisasi role DB/Indonesia -> kanonis Indonesia:
 * 'librarian' -> 'pustakawan', 'member' -> 'anggota', 'admin' tetap.
 * Tak dikenal/null/undefined -> 'anggota' (fail-closed).
 */
export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === 'admin') return 'admin';
  if (role === 'librarian' || role === 'pustakawan') return 'pustakawan';
  if (role === 'member' || role === 'anggota') return 'anggota';
  return 'anggota';
}

/**
 * Apakah role termasuk allowedRoles, dibandingkan di ruang normalizeRole()
 * (semantik DB 'admin'|'librarian'|'member' dan label Indonesia
 * 'admin'|'pustakawan'|'anggota' disamakan). Fail-closed: role null/tak
 * dikenal jadi 'anggota' -> tidak staf.
 */
export function roleAllowed(
  role: string | null | undefined,
  allowedRoles: readonly DbRole[]
): boolean {
  const allowed = allowedRoles.map(normalizeRole);
  return allowed.includes(normalizeRole(role));
}

/**
 * Predikat staf kanonis — definisi SAMA dengan requireStaff()
 * (src/lib/supabase/auth.ts). Dipakai middleware gate /admin, admin/layout.tsx,
 * dan handler campuran staf-atau-pemilik.
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return roleAllowed(role, STAFF_ROLES);
}

/** Predikat admin kanonis (mis. PUT /api/settings/theme, halaman logs). */
export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'admin';
}
