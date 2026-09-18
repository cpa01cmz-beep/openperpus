import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, slugify, parsePaging } from "@/lib/supabase/auth";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/categories?page=&per_page=&q= — publik (filter OPAC, hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (butuh login staff).
 * POST /api/categories — pustakawan+ {nama|name, deskripsi?|description?, icon?|cover_url?, sort_order?, is_active?}
 * PUT /api/categories?id= — pustakawan+
 * DELETE /api/categories?id= — admin (409 bila dipakai buku)
 * Kolom migrasi 0001: name UNIQUE, slug UNIQUE, description, cover_url, sort_order, is_active.
 */

function pickName(body: Record<string, unknown>): string {
  return String(body.name ?? body.nama ?? "").trim();
}

function buildPayload(body: Record<string, unknown>, title: string) {
  return {
    name: title,
    slug: typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title),
    description: ((body.description ?? body.deskripsi) as string | null) ?? null,
    cover_url: ((body.cover_url ?? body.icon ?? body.gambar_url) as string | null) ?? null,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : 0,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
  };
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
      entity_type: "categories",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateCategories() {
  const done: string[] = [];
  try {
    revalidateTag("categories");
    done.push("categories");
  } catch { /* abaikan di runtime tanpa cache-tag */ }
  try {
    revalidatePath("/katalog");
    done.push("/katalog");
  } catch { /* abaikan */ }
  return done;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get("all");

  // ?all=1 butuh staf (lihat data non-aktif untuk admin).
  let staff = false;
  if (all === "1") {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
    staff = true;
  }
  void staff;

  let query = supabase
    .from("categories")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (all !== "1") query = query.eq("is_active", true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`name.ilike.%${clean}%,slug.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil kategori.", 500, error.message);
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

  const name = pickName(body);
  if (!name) return jsonError("VALIDATION", "nama/name wajib diisi.", 422);
  if (name.length > 200) return jsonError("VALIDATION", "nama maksimal 200 karakter.", 422);

  const payload = buildPayload(body, name);
  if (!Number.isInteger(payload.sort_order)) return jsonError("VALIDATION", "sort_order harus bilangan bulat.", 422);

  const { data, error } = await supabase.from("categories").insert(payload).select().single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Nama/slug kategori sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal menambah kategori.", 500, error.message);
  }

  await writeLog(supabase, user?.id, "categories.create", (data as { id: string }).id, { name });
  return NextResponse.json({ data, revalidated: revalidateCategories() }, { status: 201 });
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
  if (body.name !== undefined || body.nama !== undefined) {
    const name = pickName(body);
    if (!name) return jsonError("VALIDATION", "nama/name tidak boleh kosong.", 422);
    payload.name = name;
    payload.slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);
  } else if (typeof body.slug === "string" && body.slug.trim()) {
    payload.slug = slugify(body.slug);
  }
  if (body.description !== undefined || body.deskripsi !== undefined) payload.description = (body.description ?? body.deskripsi) as string | null;
  if (body.cover_url !== undefined || body.icon !== undefined || body.gambar_url !== undefined) {
    payload.cover_url = (body.cover_url ?? body.icon ?? body.gambar_url) as string | null;
  }
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(Number(body.sort_order))) return jsonError("VALIDATION", "sort_order harus bilangan bulat.", 422);
    payload.sort_order = Number(body.sort_order);
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase.from("categories").update(payload).eq("id", id).select().single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Nama/slug kategori sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal mengupdate kategori.", 500, error.message);
  }

  await writeLog(supabase, user?.id, "categories.update", id, payload);
  return NextResponse.json({ data, revalidated: revalidateCategories() });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { count } = await supabase.from("books").select("id", { count: "exact", head: true }).eq("category_id", id);
  if ((count ?? 0) > 0) return jsonError("CONFLICT", "Kategori dipakai buku, tidak bisa dihapus.", 409);

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus kategori.", 500, error.message);

  await writeLog(supabase, user?.id, "categories.delete", id);
  return NextResponse.json({ message: "Kategori dihapus.", revalidated: revalidateCategories() });
}
