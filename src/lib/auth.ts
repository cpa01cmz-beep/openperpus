/**
 * src/lib/auth.ts — guard role kanonis Indonesia (docs/architecture.md §4).
 *
 * KEPUTUSAN MAPPING ROLE:
 * - Database/migrasi memakai: 'admin' | 'librarian' | 'member'.
 * - Dokumen arsitektur & kontrak memakai istilah Indonesia:
 *   'admin' | 'pustakawan' | 'anggota'.
 * - File ini MENERIMA KEDUANYA dan menormalisasi ke bentuk Indonesia:
 *     'librarian' -> 'pustakawan', 'member' -> 'anggota',
 *     'admin'/'pustakawan'/'anggota' tetap.
 * - `requireRole()` membandingkan dalam bentuk ternormalisasi, jadi
 *   `requireRole(['admin','pustakawan'])` lolos untuk baris DB
 *   ber-role 'admin' maupun 'librarian'.
 * - src/lib/supabase/auth.ts TIDAK diubah (requireStaff tetap memakai
 *   'admin'|'librarian' untuk kompatibilitas route lama).
 */

import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/supabase/auth";

export type DbRole = "admin" | "librarian" | "member";
export type AppRole = "admin" | "pustakawan" | "anggota";
export type AnyRole = DbRole | AppRole;

/** Normalisasi role DB/Indonesia -> kanonis Indonesia. Tak dikenal -> 'anggota'. */
export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === "admin") return "admin";
  if (role === "librarian" || role === "pustakawan") return "pustakawan";
  if (role === "member" || role === "anggota") return "anggota";
  return "anggota";
}

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
  | { supabase: ReturnType<typeof createClient>; user: null; profile: null; role: null; rawRole: null }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, role: null, rawRole: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const rawRole = (profile as { role?: string } | null)?.role ?? "anggota";
  return {
    supabase,
    user: user as unknown as SessionUser["user"],
    profile: (profile ?? { role: rawRole }) as SessionUser["profile"],
    role: normalizeRole(rawRole),
    rawRole,
  };
}

/**
 * Guard role untuk Server Component / Route Handler.
 * Pola return mengikuti requireStaff: { supabase,user,profile,role }
 * bila lolos, atau { errorResponse } bila gagal (langsung return ke client).
 */
export async function requireRole(allowedRoles: AnyRole[] = ["admin", "pustakawan"]) {
  const session = await getSessionUser();

  if (!session.user) {
    return { errorResponse: jsonError("UNAUTHORIZED", "Silakan login.", 401) };
  }

  const allowed = allowedRoles.map(normalizeRole);
  const role = normalizeRole((session.profile as { role?: string } | null)?.role);

  if (!allowed.includes(role)) {
    return { errorResponse: jsonError("FORBIDDEN", "Butuh peran admin/pustakawan.", 403) };
  }

  return { ...session, role } as SessionUser;
}
