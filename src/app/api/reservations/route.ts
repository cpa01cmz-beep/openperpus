import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { jsonError, parsePaging } from "@/lib/supabase/auth";

/**
 * GET /api/reservations?status=&member_id=&book_id=&page=&per_page=
 *   — anggota: otomatis miliknya (member_id diabaikan); pustakawan+: semua/filter.
 * POST /api/reservations {book_id, member_id?, notes?}
 *   — anggota: {book_id} -> pending (member_id miliknya); pustakawan+: boleh untuk member lain.
 * PUT /api/reservations?id= {status|notes} — batal: {status:"batal"|"cancelled"}
 * DELETE /api/reservations?id= — pemilik / pustakawan+ (hanya pending/cancelled/expired)
 *
 * Kolom migrasi 0001: book_id, member_id, status pending|ready|completed|cancelled|expired,
 * reserved_at, expires_at, notes. Unik pending (book_id,member_id).
 */

const STATUSES = ["pending", "ready", "completed", "cancelled", "expired"] as const;

function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function normStatus(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "batal" || s === "cancel") return "cancelled";
  if (s === "menunggu") return "pending";
  if (s === "selesai") return "completed";
  if ((STATUSES as readonly string[]).includes(s)) return s;
  return s; // biarkan validasi di bawah menolak
}

async function writeLog(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action,
      entity_type: "reservations",
      entity_id: entityId,
      metadata,
    });
  } catch { /* best-effort */ }
}

function revalidateReservations(): string[] {
  const done: string[] = [];
  try { revalidateTag("reservations"); done.push("reservations"); } catch { /* abaikan */ }
  try { revalidatePath("/admin/reservasi"); done.push("/admin/reservasi"); } catch { /* abaikan */ }
  return done;
}

type Session = {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  role: string;
  memberId: string | null;
  isStaff: boolean;
};

/** Sesi login apa pun (anggota boleh). Kembalikan 401 bila belum login. */
async function getSession(): Promise<{ session: Session } | { errorResponse: ReturnType<typeof jsonError> }> {
  const supabase = createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { errorResponse: jsonError("UNAUTHORIZED", "Silakan login.", 401) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? "member";
  const isStaff = role === "admin" || role === "librarian";

  const { data: member } = await supabase.from("members").select("id").eq("user_id", user.id).maybeSingle();
  const memberId = (member as { id: string } | null)?.id ?? null;

  return { session: { supabase, userId: user.id, role, memberId, isStaff } };
}

export async function GET(req: Request) {
  const s = await getSession();
  if ("errorResponse" in s) return s.errorResponse;
  const { supabase, memberId, isStaff } = s.session;

  const { sp, page, perPage, from, to } = parsePaging(req.url, 20);
  const status = (sp.get("status") ?? "").trim();
  const bookId = (sp.get("book_id") ?? "").trim();
  let memberFilter = (sp.get("member_id") ?? "").trim();

  // Anggota: paksa miliknya.
  if (!isStaff) memberFilter = memberId ?? "__none__";

  let query = supabase
    .from("reservations")
    .select("*, books(id,title,slug), members(id,member_code)", { count: "exact" })
    .order("reserved_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (bookId) query = query.eq("book_id", bookId);
  if (memberFilter) query = query.eq("member_id", memberFilter);

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil reservasi.", 500, error.message);
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      meta: { page, per_page: perPage, total },
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const s = await getSession();
  if ("errorResponse" in s) return s.errorResponse;
  const { supabase, userId, memberId, isStaff } = s.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const book_id = (body.book_id ?? body.bookId ?? body.book) as string;
  if (!isUuid(book_id)) return jsonError("VALIDATION", "book_id harus UUID valid.", 422);

  // Tentukan member pemilik reservasi.
  let targetMember = memberId;
  if (isStaff && isUuid(body.member_id)) targetMember = body.member_id as string;
  if (!isUuid(targetMember)) {
    return jsonError("VALIDATION", "Akun belum terdaftar sebagai anggota (members kosong).", 422);
  }

  const { data: book } = await supabase.from("books").select("id,is_active").eq("id", book_id).single();
  if (!book) return jsonError("NOT_FOUND", "Buku tidak ditemukan.", 404);

  const { data: member } = await supabase.from("members").select("id,status").eq("id", targetMember).single();
  if (!member) return jsonError("NOT_FOUND", "Anggota tidak ditemukan.", 404);
  if ((member as { status: string }).status !== "active") {
    return jsonError("VALIDATION", "Anggota tidak aktif.", 422);
  }

  const expiresRaw = body.expires_at as string | undefined;
  let expires_at: string | null = null;
  if (expiresRaw) {
    const d = new Date(expiresRaw);
    if (Number.isNaN(d.getTime())) return jsonError("VALIDATION", "expires_at tidak valid.", 422);
    expires_at = d.toISOString();
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      book_id,
      member_id: targetMember,
      status: "pending",
      expires_at,
      notes: (body.notes as string | null) ?? null,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return jsonError("CONFLICT", "Reservasi pending untuk buku ini sudah ada.", 409, error.message);
    }
    return jsonError("SAVE_FAILED", "Gagal membuat reservasi.", 500, error.message);
  }

  await writeLog(supabase, userId, "reservations.create", (data as { id: string }).id, { book_id, member_id: targetMember });
  return NextResponse.json({ data, revalidated: revalidateReservations() }, { status: 201 });
}

export async function PUT(req: Request) {
  const s = await getSession();
  if ("errorResponse" in s) return s.errorResponse;
  const { supabase, userId, memberId, isStaff, role } = s.session;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const { data: cur } = await supabase.from("reservations").select("*").eq("id", id).single();
  if (!cur) return jsonError("NOT_FOUND", "Reservasi tidak ditemukan.", 404);
  const c = cur as { member_id: string; status: string };

  if (!isStaff && c.member_id !== memberId) return jsonError("FORBIDDEN", "Bukan reservasi milik Anda.", 403);

  const payload: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = normStatus(body.status);
    if (!(STATUSES as readonly string[]).includes(st as string)) {
      return jsonError("VALIDATION", "status harus: pending|ready|completed|cancelled|expired.", 422);
    }
    // Anggota hanya boleh membatalkan miliknya.
    if (!isStaff && st !== "cancelled") return jsonError("FORBIDDEN", "Anggota hanya boleh membatalkan reservasi.", 403);
    payload.status = st;
  }
  if (body.notes !== undefined) payload.notes = body.notes as string | null;
  // Hanya staf boleh set ready/completed/expired/expires_at.
  if (!isStaff && (body.expires_at !== undefined || payload.status === "ready" || payload.status === "completed")) {
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

  await writeLog(supabase, userId, `reservations.${String(payload.status ?? "update")}`, id, { role, ...payload });
  return NextResponse.json({ data, revalidated: revalidateReservations() });
}

export async function PATCH(req: Request) {
  return PUT(req);
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if ("errorResponse" in s) return s.errorResponse;
  const { supabase, userId, memberId, isStaff } = s.session;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { data: cur } = await supabase.from("reservations").select("member_id,status").eq("id", id).single();
  if (!cur) return jsonError("NOT_FOUND", "Reservasi tidak ditemukan.", 404);
  const c = cur as { member_id: string; status: string };
  if (!isStaff && c.member_id !== memberId) return jsonError("FORBIDDEN", "Bukan reservasi milik Anda.", 403);
  if (c.status === "ready" || c.status === "completed") {
    return jsonError("CONFLICT", "Reservasi yang sudah diproses tidak bisa dihapus. Batalkan dulu via staff.", 409);
  }

  const { error } = await supabase.from("reservations").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus reservasi.", 500, error.message);

  await writeLog(supabase, userId, "reservations.delete", id);
  return NextResponse.json({ message: "Reservasi dihapus.", revalidated: revalidateReservations() });
}
