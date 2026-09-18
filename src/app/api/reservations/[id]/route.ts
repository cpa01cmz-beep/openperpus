import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/supabase/auth";

type Ctx = { params: { id: string } };

/**
 * GET /api/reservations/[id] — pemilik / pustakawan+
 * PATCH /api/reservations/[id] {status:"batal"|..., notes?} — pemilik hanya boleh batal
 * PUT /api/reservations/[id] — alias PATCH (staf penuh)
 * DELETE /api/reservations/[id] — pemilik / pustakawan+
 */

const STATUSES = ["pending", "ready", "completed", "cancelled", "expired"] as const;

function normStatus(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "batal" || s === "cancel") return "cancelled";
  if (s === "menunggu") return "pending";
  if (s === "selesai") return "completed";
  return s;
}

function revalidated(): string[] {
  const done: string[] = [];
  try { revalidateTag("reservations"); done.push("reservations"); } catch { /* abaikan */ }
  try { revalidatePath("/admin/reservasi"); done.push("/admin/reservasi"); } catch { /* abaikan */ }
  return done;
}

async function scoped(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { errorResponse: jsonError("UNAUTHORIZED", "Silakan login.", 401) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? "member";
  const isStaff = role === "admin" || role === "librarian";
  const { data: member } = await supabase.from("members").select("id").eq("user_id", user.id).maybeSingle();
  const memberId = (member as { id: string } | null)?.id ?? null;

  const { data: cur } = await supabase.from("reservations").select("*, books(id,title,slug)").eq("id", id).single();
  if (!cur) return { errorResponse: jsonError("NOT_FOUND", "Reservasi tidak ditemukan.", 404) };
  const c = cur as { member_id: string };
  if (!isStaff && c.member_id !== memberId) return { errorResponse: jsonError("FORBIDDEN", "Bukan reservasi milik Anda.", 403) };

  return { supabase, userId: user.id, role, isStaff, memberId, cur };
}

export async function GET(_req: Request, { params }: Ctx) {
  const sc = await scoped(params.id);
  if ("errorResponse" in sc) return sc.errorResponse;
  return NextResponse.json({ data: sc.cur }, { headers: { "Cache-Control": "no-store" } });
}

async function updateById(req: Request, id: string) {
  const sc = await scoped(id);
  if ("errorResponse" in sc) return sc.errorResponse;
  const { supabase, userId, role, isStaff } = sc;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = normStatus(body.status);
    if (!(STATUSES as readonly string[]).includes(st)) {
      return jsonError("VALIDATION", "status harus: pending|ready|completed|cancelled|expired.", 422);
    }
    if (!isStaff && st !== "cancelled") return jsonError("FORBIDDEN", "Anggota hanya boleh membatalkan reservasi.", 403);
    payload.status = st;
  }
  if (body.notes !== undefined) payload.notes = body.notes as string | null;
  if (!isStaff && body.expires_at !== undefined) {
    return jsonError("FORBIDDEN", "Hanya pustakawan yang boleh memproses reservasi.", 403);
  }
  if (isStaff && body.expires_at !== undefined) {
    if (body.expires_at === null) payload.expires_at = null;
    else {
      const d = new Date(body.expires_at as string);
      if (Number.isNaN(d.getTime())) return jsonError("VALIDATION", "expires_at tidak valid.", 422);
      payload.expires_at = d.toISOString();
    }
  }

  const { data, error } = await supabase.from("reservations").update(payload).eq("id", id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate reservasi.", 500, error.message);

  try {
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: `reservations.${String(payload.status ?? "update")}`,
      entity_type: "reservations",
      entity_id: id,
      metadata: { role, ...payload },
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ data, revalidated: revalidated() });
}

export async function PUT(req: Request, ctx: Ctx) {
  return updateById(req, ctx.params.id);
}

export async function PATCH(req: Request, ctx: Ctx) {
  return updateById(req, ctx.params.id);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const sc = await scoped(params.id);
  if ("errorResponse" in sc) return sc.errorResponse;
  const { supabase, userId, isStaff } = sc;
  const c = sc.cur as { status: string };

  if (c.status === "ready" || c.status === "completed") {
    return jsonError("CONFLICT", "Reservasi yang sudah diproses tidak bisa dihapus.", 409);
  }
  void isStaff;

  const { error } = await supabase.from("reservations").delete().eq("id", params.id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus reservasi.", 500, error.message);

  try {
    await supabase.from("activity_logs").insert({
      user_id: userId, action: "reservations.delete", entity_type: "reservations", entity_id: params.id, metadata: {},
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ message: "Reservasi dihapus.", revalidated: revalidated() });
}
