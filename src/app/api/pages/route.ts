import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, slugify, parsePaging } from "@/lib/supabase/auth";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/pages?page=&per_page=&q= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif). ?id= untuk satu halaman.
 * POST /api/pages — pustakawan+ {title|judul, slug?, content_md|konten, excerpt|ringkasan?, seo_title?, seo_desc?, is_active|status?, show_in_menu?}
 * PUT /api/pages?id= — pustakawan+
 * DELETE /api/pages?id= — admin
 * Kolom migrasi 0001 (+0004 show_in_menu): slug UNIQUE, title, content_md, excerpt,
 * seo_title, seo_desc, is_active, show_in_menu.
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
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidatePages(slug?: string | null): string[] {
  const done: string[] = [];
  try {
    revalidateTag("pages");
    done.push("pages");
  } catch { /* abaikan di runtime tanpa cache-tag */ }
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

export async function GET(req: Request) {
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get("all");
  const id = (sp.get("id") ?? "").trim();

  // ?all=1 butuh staf (lihat data nonaktif untuk admin).
  if (all === "1") {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  }

  // ?id= — satu halaman (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from("pages").select("*").eq("id", id).single();
    if (error || !data) return jsonError("NOT_FOUND", "Halaman tidak ditemukan.", 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== "1") {
      const guard = await requireStaff();
      if ("errorResponse" in guard && guard.errorResponse) return jsonError("NOT_FOUND", "Halaman tidak ditemukan.", 404);
    }
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": all === "1" ? "no-store" : "public, s-maxage=300" } }
    );
  }

  let query = supabase
    .from("pages")
    .select("*", { count: "exact" })
    .order("title", { ascending: true })
    .range(from, to);

  if (all !== "1") query = query.eq("is_active", true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`title.ilike.%${clean}%,slug.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil halaman.", 500, error.message);
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

  const title = String(body.title ?? body.judul ?? "").trim();
  if (!title) return jsonError("VALIDATION", "title/judul wajib diisi.", 422);
  const content_md = String(body.content_md ?? body.konten ?? body.content ?? body.isi ?? "").trim();
  if (!content_md) return jsonError("VALIDATION", "content_md/konten wajib diisi.", 422);

  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  if (!slug) return jsonError("VALIDATION", "slug tidak valid.", 422);

  const showRaw = body.show_in_menu ?? body.tampil_di_menu;

  const { data, error } = await supabase
    .from("pages")
    .insert({
      title,
      slug,
      content_md,
      excerpt: ((body.excerpt ?? body.ringkasan) as string | null) ?? null,
      seo_title: (body.seo_title as string | null) ?? null,
      seo_desc: (body.seo_desc as string | null) ?? null,
      is_active: parseActive(body.is_active ?? body.status ?? body.aktif, true),
      show_in_menu: showRaw === undefined ? false : Boolean(showRaw),
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Slug halaman sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal menambah halaman.", 500, error.message);
  }

  await writeLog(supabase, user?.id, "pages.create", (data as { id: string }).id, { title, slug });
  return NextResponse.json({ data, revalidated: revalidatePages((data as { slug: string }).slug) }, { status: 201 });
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

  const { data, error } = await supabase.from("pages").update(payload).eq("id", id).select().single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Slug halaman sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal mengupdate halaman.", 500, error.message);
  }

  await writeLog(supabase, user?.id, "pages.update", id, payload);
  return NextResponse.json({ data, revalidated: revalidatePages((data as { slug?: string })?.slug) });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  // Ambil slug dulu agar path /halaman/[slug] bisa di-revalidate.
  const { data: cur } = await supabase.from("pages").select("slug").eq("id", id).single();

  const { error } = await supabase.from("pages").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus halaman.", 500, error.message);

  await writeLog(supabase, user?.id, "pages.delete", id);
  return NextResponse.json({
    message: "Halaman dihapus.",
    revalidated: revalidatePages((cur as { slug?: string } | null)?.slug),
  });
}
