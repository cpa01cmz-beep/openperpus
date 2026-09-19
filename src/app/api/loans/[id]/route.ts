import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, calcFine } from "@/lib/supabase/auth";

type Ctx = { params: { id: string } };

/**
 * GET /api/loans/[id] — pustakawan+ (atau pemilik? kontrak: anggota otomatis miliknya).
 *   Di sini: staf penuh; anggota boleh bila loan miliknya.
 * PUT /api/loans/[id] {action:"return", returned_at?, notes?} — pustakawan+ (alias route koleksi ?id=)
 * DELETE /api/loans/[id] — admin (hanya returned/lost)
 */

function revalidateLoans(): string[] {
  const done: string[] = [];
  try { revalidateTag("loans"); done.push("loans"); } catch { /* abaikan */ }
  try { revalidateTag("books"); done.push("books"); } catch { /* abaikan */ }
  try { revalidatePath("/admin/peminjaman"); done.push("/admin/peminjaman"); } catch { /* abaikan */ }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return jsonError("UNAUTHORIZED", "Silakan login.", 401);

  const { data: loan, error } = await supabase
    .from("loans")
    .select("*, members(id,member_code,user_id), books(id,title,slug)")
    .eq("id", params.id)
    .single();
  if (error || !loan) return jsonError("NOT_FOUND", "Peminjaman tidak ditemukan.", 404, error?.message);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? "member";
  const isStaff = role === "admin" || role === "librarian";
  if (!isStaff) {
    const owner = (loan as { members: { user_id: string } | null }).members?.user_id;
    if (owner !== user.id) return jsonError("FORBIDDEN", "Bukan pinjaman milik Anda.", 403);
  }

  return NextResponse.json({ data: loan }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }
  if (body.action !== "return") return jsonError("VALIDATION", "Kirim { action: 'return' }.", 422);

  const { data: loan } = await supabase.from("loans").select("*").eq("id", params.id).single();
  if (!loan) return jsonError("NOT_FOUND", "Peminjaman tidak ditemukan.", 404);
  const l = loan as { status: string; due_at: string; book_id: string; member_id: string };
  if (l.status === "returned") return jsonError("CONFLICT", "Sudah dikembalikan.", 409);

  const returnedAt = body.returned_at ? new Date(body.returned_at as string) : new Date();
  if (Number.isNaN(returnedAt.getTime())) return jsonError("VALIDATION", "returned_at tidak valid.", 422);
  const fine = calcFine(l.due_at, returnedAt);

  const { data, error } = await supabase
    .from("loans")
    .update({
      returned_at: returnedAt.toISOString(),
      status: "returned",
      fine_amount: fine,
      ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return jsonError("SAVE_FAILED", "Gagal memproses pengembalian.", 500, error.message);

  const { data: book } = await supabase.from("books").select("stock_available,stock_total").eq("id", l.book_id).single();
  if (book) {
    const b = book as { stock_available: number; stock_total: number };
    await supabase.from("books").update({ stock_available: Math.min(b.stock_total, b.stock_available + 1) }).eq("id", l.book_id);
  }
  if (fine > 0) {
    await supabase.from("fines").insert({
      loan_id: params.id,
      member_id: l.member_id,
      amount: fine,
      status: "unpaid",
      notes: `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}).`,
    });
  }

  const auditPayload = {
    user_id: user?.id ?? null, action: "loans.return", entity_type: "loans", entity_id: params.id,
    metadata: { fine },
  };
  const firstAudit = await supabase.from("activity_logs").insert(auditPayload);
  if (firstAudit.error) {
    console.error("[audit] activity_logs insert failed (retrying once):", firstAudit.error.message);
    const retryAudit = await supabase.from("activity_logs").insert(auditPayload);
    if (retryAudit.error) {
      console.error("[audit] activity_logs insert failed twice (500 detail):", retryAudit.error.message, auditPayload);
    }
  }

  return NextResponse.json({ data, revalidated: revalidateLoans() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const { data: loan } = await supabase.from("loans").select("status").eq("id", params.id).single();
  if (!loan) return jsonError("NOT_FOUND", "Peminjaman tidak ditemukan.", 404);
  if ((loan as { status: string }).status === "borrowed" || (loan as { status: string }).status === "overdue") {
    return jsonError("CONFLICT", "Tidak bisa hapus peminjaman berjalan. Kembalikan dulu.", 409);
  }

  const { error } = await supabase.from("loans").delete().eq("id", params.id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus peminjaman.", 500, error.message);

  try {
    await supabase.from("activity_logs").insert({
      user_id: user?.id ?? null, action: "loans.delete", entity_type: "loans", entity_id: params.id, metadata: {},
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ message: "Peminjaman dihapus.", revalidated: revalidateLoans() });
}
