import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, slugify } from "@/lib/supabase/auth";

type Ctx = { params: { id: string } };

/**
 * GET /api/pages/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/pages/[id] — pustakawan+
 * DELETE /api/pages/[id] — admin
 */

function parseActive(v: unknown, def = true): boolean {
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "published", "publish", "active", "aktif", "ya", "yes"].includes(s)) return true;
  if (["false", "0", "draft", "archived", "inactive", "nonaktif", "tidak", "no"].includes(s)) return false;
  return def;
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
      entity_type: "pages",
      entity_id: entityId,
      metadata,
    });
  } catch { /* best-effort */ }
}

function revalidatePages(slug?: string | null): string[] {
  const done: string[] = [];
  try {
    revalidateTag("pages");
    done.push("pages");
  } catch { /* abaikan */ }
  try {
    revalidatePath("/");
    done.push("/");
  } catch { /* abaikan */ }
  if (slug) {
    try {
      revalidatePath(`/halaman/${slug}`);
      done.push(`/halaman/${slug}`);
    } catch { /* abaikan */ }
  }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createClient();
  const { data, error } = await supabase.from("pages").select("*").eq("id", params.id).single();
  if (error || !data) return jsonError("NOT_FOUND", "Halaman tidak ditemukan.", 404, error?.message);

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return jsonError("NOT_FOUND", "Halaman tidak ditemukan.", 404);
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
  if (body.title !== undefined || body.judul !== undefined) {
    const title = String(body.title ?? body.judul ?? "").trim();
    if (!title) return jsonError("VALIDATION", "title/judul tidak boleh kosong.", 422);
    payload.title = title;
    payload.slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  } else if (typeof body.slug === "string" && body.slug.trim()) {
    payload.slug = slugify(body.slug);
  }
  if (body.content_md !== undefined || body.konten !== undefined || body.content !== undefined || body.isi !== undefined) {
    const content_md = String(body.content_md ?? body.konten ?? body.content ?? body.isi ?? "").trim();
    if (!content_md) return jsonError("VALIDATION", "content_md/konten tidak boleh kosong.", 422);
    payload.content_md = content_md;
  }
  if (body.excerpt !== undefined || body.ringkasan !== undefined) payload.excerpt = (body.excerpt ?? body.ringkasan) as string | null;
  if (body.seo_title !== undefined) payload.seo_title = body.seo_title as string | null;
  if (body.seo_desc !== undefined) payload.seo_desc = body.seo_desc as string | null;
  if (body.is_active !== undefined || body.status !== undefined || body.aktif !== undefined) {
    payload.is_active = parseActive(body.is_active ?? body.status ?? body.aktif, true);
  }
  if (body.show_in_menu !== undefined || body.tampil_di_menu !== undefined) {
    payload.show_in_menu = Boolean(body.show_in_menu ?? body.tampil_di_menu);
  }
  if (Object.keys(payload).length === 0) return jsonError("VALIDATION", "Tidak ada field yang diupdate.", 422);

  const { data, error } = await supabase.from("pages").update(payload).eq("id", params.id).select().single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Slug halaman sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal mengupdate halaman.", 500, error.message);
  }

  await writeLog(supabase, user?.id, "pages.update", params.id, payload);
  return NextResponse.json({ data, revalidated: revalidatePages((data as { slug?: string })?.slug) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const { data: cur } = await supabase.from("pages").select("slug").eq("id", params.id).single();

  const { error } = await supabase.from("pages").delete().eq("id", params.id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus halaman.", 500, error.message);

  await writeLog(supabase, user?.id, "pages.delete", params.id);
  return NextResponse.json({
    message: "Halaman dihapus.",
    revalidated: revalidatePages((cur as { slug?: string } | null)?.slug),
  });
}
