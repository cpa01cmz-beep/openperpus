import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError, parsePaging } from "@/lib/supabase/auth";

/**
 * GET /api/fines?member_id=&status=&page=&per_page=
 *   — anggota: otomatis miliknya (member_id diabaikan); pustakawan+: semua/filter.
 * Kolom migrasi 0001: loan_id, member_id, amount, paid_amount, status
 * unpaid|partial|paid|waived, issued_at, paid_at, notes.
 * Bayar via POST /api/fines/[id]/pay (pustakawan+).
 */

const STATUSES = ["unpaid", "partial", "paid", "waived"] as const;

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return jsonError("UNAUTHORIZED", "Silakan login.", 401);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? "member";
  const isStaff = role === "admin" || role === "librarian";

  const { data: member } = await supabase.from("members").select("id").eq("user_id", user.id).maybeSingle();
  const ownMemberId = (member as { id: string } | null)?.id ?? null;

  const { sp, page, perPage, from, to } = parsePaging(req.url, 20);
  const status = (sp.get("status") ?? "").trim();
  let memberFilter = (sp.get("member_id") ?? "").trim();
  if (!isStaff) memberFilter = ownMemberId ?? "__none__";

  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return jsonError("VALIDATION", "status harus: unpaid|partial|paid|waived.", 422);
  }

  let query = supabase
    .from("fines")
    .select("*, loans(id,book_id,due_at,status), members(id,member_code)", { count: "exact" })
    .order("issued_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (memberFilter) query = query.eq("member_id", memberFilter);

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil denda.", 500, error.message);
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
