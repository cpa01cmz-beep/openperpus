import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, calcFine } from "@/lib/supabase/auth";

type Ctx = { params: { id: string } };

/**
 * POST /api/loans/[id]/return {tanggal_kembali?, returned_at?, kondisi?|notes?}
 *   — pustakawan+. Server hitung denda Rp1000/hari, buat row fines bila >0,
 *   kembalikan stok (+1 clamp stock_total).
 * Kondisi (kontrak): baik|rusak|hilang — dicatat ke notes (tanpa kolom baru).
 */

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const kondisi = String(body.kondisi ?? body.condition ?? "baik").trim().toLowerCase();
  if (!["baik", "rusak", "hilang"].includes(kondisi)) {
    return jsonError("VALIDATION", "kondisi harus: baik|rusak|hilang.", 422);
  }

  const { data: loan } = await supabase.from("loans").select("*").eq("id", params.id).single();
  if (!loan) return jsonError("NOT_FOUND", "Peminjaman tidak ditemukan.", 404);
  const l = loan as { status: string; due_at: string; book_id: string; member_id: string };
  if (l.status === "returned") return jsonError("CONFLICT", "Sudah dikembalikan.", 409);

  const rawDate = (body.tanggal_kembali ?? body.returned_at) as string | undefined;
  const returnedAt = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(returnedAt.getTime())) return jsonError("VALIDATION", "tanggal_kembali/returned_at tidak valid.", 422);

  const fine = calcFine(l.due_at, returnedAt);
  const noteExtra = typeof body.notes === "string" && body.notes.trim() ? ` | ${body.notes.trim()}` : "";

  const { data, error } = await supabase
    .from("loans")
    .update({
      returned_at: returnedAt.toISOString(),
      status: kondisi === "hilang" ? "lost" : "returned",
      fine_amount: fine,
      notes: `Kondisi kembali: ${kondisi}${noteExtra}`,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return jsonError("SAVE_FAILED", "Gagal memproses pengembalian.", 500, error.message);

  // Stok: baik -> +1 (clamp); rusak/hilang -> stock_total -1 + sesuaikan available (tanpa negatif).
  const { data: book } = await supabase.from("books").select("stock_available,stock_total").eq("id", l.book_id).single();
  if (book) {
    const b = book as { stock_available: number; stock_total: number };
    if (kondisi === "baik") {
      await supabase.from("books").update({ stock_available: Math.min(b.stock_total, b.stock_available + 1) }).eq("id", l.book_id);
    } else {
      const nextTotal = Math.max(0, b.stock_total - 1);
      await supabase.from("books").update({
        stock_total: nextTotal,
        stock_available: Math.min(Math.max(0, b.stock_available), nextTotal),
      }).eq("id", l.book_id);
    }
  }

  if (fine > 0) {
    await supabase.from("fines").insert({
      loan_id: params.id,
      member_id: l.member_id,
      amount: fine,
      status: "unpaid",
      notes: `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}). Kondisi: ${kondisi}.`,
    });
  }

  const auditPayload = {
    user_id: user?.id ?? null, action: "loans.return", entity_type: "loans", entity_id: params.id,
    metadata: { fine, kondisi, book_id: l.book_id },
  };
  const firstAudit = await supabase.from("activity_logs").insert(auditPayload);
  if (firstAudit.error) {
    console.error("[audit] activity_logs insert failed (retrying once):", firstAudit.error.message);
    const retryAudit = await supabase.from("activity_logs").insert(auditPayload);
    if (retryAudit.error) {
      console.error("[audit] activity_logs insert failed twice (500 detail):", retryAudit.error.message, auditPayload);
    }
  }

  const revalidated: string[] = [];
  try { revalidateTag("loans"); revalidated.push("loans"); } catch { /* abaikan */ }
  try { revalidateTag("books"); revalidated.push("books"); } catch { /* abaikan */ }
  try { revalidateTag("fines"); revalidated.push("fines"); } catch { /* abaikan */ }
  try { revalidatePath("/admin/peminjaman"); revalidated.push("/admin/peminjaman"); } catch { /* abaikan */ }

  return NextResponse.json({ data, revalidated });
}
