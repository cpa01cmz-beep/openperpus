import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, parsePaging } from "@/lib/supabase/auth";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/members?page=&per_page=&q=&status= — pustakawan+
 * POST /api/members { user_id, member_code?, phone?, address?, status? }
 * PUT /api/members?id= — partial update (status/address/phone)
 * DELETE /api/members?id= (admin; tolak bila ada loan borrowed/overdue)
 *
 * Kolom mengikuti migrasi 0001: user_id(FK profiles, UNIQUE NOT NULL),
 * member_code UNIQUE, address, phone, join_date, status active|suspended|expired|pending.
 * Nama/email anggota ada di profiles.full_name — GET me-join profiles.
 */

const STATUSES = ["active", "suspended", "expired", "pending"] as const;

function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const guard = await requireStaff();
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 10);
  const status = (sp.get("status") ?? "").trim();

  let query = supabase
    .from("members")
    .select("*, profiles(id,full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`member_code.ilike.%${clean}%,phone.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil anggota.", 500, error.message);
  const total = count ?? 0;
  return NextResponse.json({
    data,
    meta: { page, per_page: perPage, total },
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  });
}

export async function POST(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  // Alias docs -> migrasi
  const user_id = (body.user_id ?? body.userId) as string;
  let member_code = (body.member_code ?? body.no_anggota ?? body.memberCode) as string | undefined;
  const phone = ((body.phone ?? body.telepon) as string | null) ?? null;
  const address = ((body.address ?? body.alamat) as string | null) ?? null;
  const status = ((body.status as string) ?? "active") as string;

  if (!isUuid(user_id)) return jsonError("VALIDATION", "user_id (profiles.id) wajib UUID valid.", 422);
  if (!(STATUSES as readonly string[]).includes(status)) {
    return jsonError("VALIDATION", "status harus: active|suspended|expired|pending.", 422);
  }
  if (!member_code || !String(member_code).trim()) {
    const d = new Date();
    member_code = `AG-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Date.now().toString().slice(-4)}`;
  }

  // Guard: profiles harus ada
  const { data: prof } = await supabase.from("profiles").select("id").eq("id", user_id).single();
  if (!prof) return jsonError("NOT_FOUND", "profiles.user_id tidak ditemukan.", 404);

  const { data, error } = await supabase
    .from("members")
    .insert({ user_id, member_code, phone, address, status })
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "member_code/user_id sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal menambah anggota.", 500, error.message);
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.phone !== undefined || body.telepon !== undefined) payload.phone = (body.phone ?? body.telepon) as string | null;
  if (body.address !== undefined || body.alamat !== undefined) payload.address = (body.address ?? body.alamat) as string | null;
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(body.status as string)) {
      return jsonError("VALIDATION", "status harus: active|suspended|expired|pending.", 422);
    }
    payload.status = body.status;
  }
  if (body.member_code !== undefined) payload.member_code = body.member_code;

  const { data, error } = await supabase.from("members").update(payload).eq("id", id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate anggota.", 500, error.message);
  return NextResponse.json({ data });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { count } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .eq("member_id", id)
    .in("status", ["borrowed", "overdue"]);
  if ((count ?? 0) > 0) return jsonError("CONFLICT", "Anggota masih punya pinjaman berjalan.", 409);

  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus anggota.", 500, error.message);
  return NextResponse.json({ message: "Anggota dihapus." });
}
