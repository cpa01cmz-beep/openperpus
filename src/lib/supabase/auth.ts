import { NextResponse } from "next/server";
import { createClient } from "./server";

export type StaffRole = "admin" | "librarian";

/**
 * Error JSON konsisten mengikuti docs/api-contract.md:
 * { "error": { "code": "FORBIDDEN", "message": "..." }, "details"?: ... }
 */
export function jsonError(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined
      ? { error: { code, message } }
      : { error: { code, message }, details },
    { status }
  );
}

/** Alias lama (string-only) tetap didukung bila ada pemanggil lama. */
export function jsonErrorMsg(message: string, status = 400, details?: unknown) {
  return jsonError("BAD_REQUEST", message, status, details);
}

/**
 * Guard API: pastikan ada user login + profiles.role termasuk allowedRoles.
 * roles mengikuti migrasi 0001: 'admin' | 'librarian' | 'member'.
 * Mengembalikan { supabase, user, profile } jika lolos,
 * atau { errorResponse } jika gagal (langsung return dari route).
 */
export async function requireStaff(allowedRoles: StaffRole[] = ["admin", "librarian"]) {
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { errorResponse: jsonError("UNAUTHORIZED", "Silakan login.", 401) };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return { errorResponse: jsonError("FORBIDDEN", "Profil tidak ditemukan.", 403) };
  }

  if (!allowedRoles.includes((profile as { role: string }).role as StaffRole)) {
    return { errorResponse: jsonError("FORBIDDEN", "Butuh peran admin/librarian.", 403) };
  }

  return { supabase, user, profile };
}

/** Slug otomatis: "Judul Buku 101" -> "judul-buku-101" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/** Denda Rp1000/hari telat. */
export const FINE_PER_DAY = 1000;

export function calcFine(dueDate: string | Date, returnDate: string | Date = new Date()): number {
  const due = new Date(dueDate);
  const ret = new Date(returnDate);
  due.setHours(0, 0, 0, 0);
  ret.setHours(0, 0, 0, 0);
  const diffMs = ret.getTime() - due.getTime();
  const lateDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return lateDays > 0 ? lateDays * FINE_PER_DAY : 0;
}

export function addDaysISO(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Pagination kompatibel kontrak (page/per_page/q) + alias lama (limit/search). */
export function parsePaging(url: string, defPerPage = 10) {
  const sp = new URL(url).searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number(sp.get("per_page") ?? sp.get("limit") ?? String(defPerPage)) || defPerPage)
  );
  const q = (sp.get("q") ?? sp.get("search") ?? "").trim();
  return { sp, page, perPage, q, from: (page - 1) * perPage, to: (page - 1) * perPage + perPage - 1 };
}

export function pageMeta(page: number, perPage: number, total: number) {
  return {
    data: undefined as unknown,
    meta: { page, per_page: perPage, total },
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  };
}
