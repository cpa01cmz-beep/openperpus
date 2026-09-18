import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, parsePaging } from "@/lib/supabase/auth";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/faqs?page=&per_page=&q=&category= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif). ?id= untuk satu FAQ.
 * POST /api/faqs — pustakawan+ {question|pertanyaan, answer|jawaban, category|kategori?, sort_order|urutan?, is_active?}
 * PUT /api/faqs?id= — pustakawan+
 * DELETE /api/faqs?id= — admin
 * Kolom migrasi 0001: question, answer, category, sort_order, is_active.
 */

function toInt(v: unknown, def: number): number {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

async function writeLog(
  supabase: ReturnType<typeof createClient>,
  userId: string | undefined,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from("activity_logs").insert({
      user_id: userId ?? null,
      action,
      entity_type: "faqs",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateFaqs(): string[] {
  const done: string[] = [];
  try {
    revalidateTag("faqs");
    done.push("faqs");
  } catch { /* abaikan di runtime tanpa cache-tag */ }
  try {
    revalidatePath("/faq");
    done.push("/faq");
  } catch { /* abaikan */ }
  return done;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get("all");
  const id = (sp.get("id") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();

  // ?all=1 butuh staf (lihat data nonaktif untuk admin).
  if (all === "1") {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  }

  // ?id= — satu FAQ (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from("faqs").select("*").eq("id", id).single();
    if (error || !data) return jsonError("NOT_FOUND", "FAQ tidak ditemukan.", 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== "1") {
      const guard = await requireStaff();
      if ("errorResponse" in guard && guard.errorResponse) return jsonError("NOT_FOUND", "FAQ tidak ditemukan.", 404);
    }
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": all === "1" ? "no-store" : "public, s-maxage=300" } }
    );
  }

  let query = supabase
    .from("faqs")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (all !== "1") query = query.eq("is_active", true);
  if (category) query = query.eq("category", category);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`question.ilike.%${clean}%,answer.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil FAQ.", 500, error.message);
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      meta: { page, per_page: perPage, total },
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { "Cache-Control": all === "1" ? "no-store" : "public, s-maxage=300" } }
  );
}

export async function POST(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const question = String(body.question ?? body.pertanyaan ?? "").trim();
  if (!question) return jsonError("VALIDATION", "question/pertanyaan wajib diisi.", 422);
  const answer = String(body.answer ?? body.jawaban ?? "").trim();
  if (!answer) return jsonError("VALIDATION", "answer/jawaban wajib diisi.", 422);
  const sort_order = toInt(body.sort_order ?? body.urutan, 0);
  if (!Number.isInteger(sort_order)) return jsonError("VALIDATION", "sort_order/urutan harus bilangan bulat.", 422);

  const { data, error } = await supabase
    .from("faqs")
    .insert({
      question,
      answer,
      category: ((body.category ?? body.kategori) as string | null) ?? null,
      sort_order,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) return jsonError("SAVE_FAILED", "Gagal menambah FAQ.", 500, error.message);

  await writeLog(supabase, user?.id, "faqs.create", (data as { id: string }).id, { question });
  return NextResponse.json({ data, revalidated: revalidateFaqs() }, { status: 201 });
}

export async function PUT(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.question !== undefined || body.pertanyaan !== undefined) {
    const question = String(body.question ?? body.pertanyaan ?? "").trim();
    if (!question) return jsonError("VALIDATION", "question/pertanyaan tidak boleh kosong.", 422);
    payload.question = question;
  }
  if (body.answer !== undefined || body.jawaban !== undefined) {
    const answer = String(body.answer ?? body.jawaban ?? "").trim();
    if (!answer) return jsonError("VALIDATION", "answer/jawaban tidak boleh kosong.", 422);
    payload.answer = answer;
  }
  if (body.category !== undefined || body.kategori !== undefined) {
    payload.category = (body.category ?? body.kategori) as string | null;
  }
  if (body.sort_order !== undefined || body.urutan !== undefined) {
    const sort_order = toInt(body.sort_order ?? body.urutan, 0);
    if (!Number.isInteger(sort_order)) return jsonError("VALIDATION", "sort_order/urutan harus bilangan bulat.", 422);
    payload.sort_order = sort_order;
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  if (Object.keys(payload).length === 0) return jsonError("VALIDATION", "Tidak ada field yang diupdate.", 422);

  const { data, error } = await supabase.from("faqs").update(payload).eq("id", id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate FAQ.", 500, error.message);

  await writeLog(supabase, user?.id, "faqs.update", id, payload);
  return NextResponse.json({ data, revalidated: revalidateFaqs() });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { error } = await supabase.from("faqs").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus FAQ.", 500, error.message);

  await writeLog(supabase, user?.id, "faqs.delete", id);
  return NextResponse.json({ message: "FAQ dihapus.", revalidated: revalidateFaqs() });
}
