import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError } from "@/lib/supabase/auth";

type Ctx = { params: { id: string } };

/**
 * GET /api/faqs/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/faqs/[id] — pustakawan+
 * DELETE /api/faqs/[id] — admin
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
  } catch { /* best-effort */ }
}

function revalidateFaqs(): string[] {
  const done: string[] = [];
  try {
    revalidateTag("faqs");
    done.push("faqs");
  } catch { /* abaikan */ }
  try {
    revalidatePath("/faq");
    done.push("/faq");
  } catch { /* abaikan */ }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createClient();
  const { data, error } = await supabase.from("faqs").select("*").eq("id", params.id).single();
  if (error || !data) return jsonError("NOT_FOUND", "FAQ tidak ditemukan.", 404, error?.message);

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return jsonError("NOT_FOUND", "FAQ tidak ditemukan.", 404);
  }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "public, s-maxage=300" } });
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

  const { data, error } = await supabase.from("faqs").update(payload).eq("id", params.id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate FAQ.", 500, error.message);

  await writeLog(supabase, user?.id, "faqs.update", params.id, payload);
  return NextResponse.json({ data, revalidated: revalidateFaqs() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const { error } = await supabase.from("faqs").delete().eq("id", params.id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus FAQ.", 500, error.message);

  await writeLog(supabase, user?.id, "faqs.delete", params.id);
  return NextResponse.json({ message: "FAQ dihapus.", revalidated: revalidateFaqs() });
}
