import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, parsePaging } from "@/lib/supabase/auth";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/testimonials?page=&per_page=&q= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif/menunggu moderasi). ?id= untuk satu testimoni.
 * POST /api/testimonials — ANON dibolehkan (form publik) tapi dipaksa is_active=false
 *   untuk moderasi staf (lihat migrasi 0004_content.sql); staf boleh set is_active/sort_order.
 *   Body {name|nama, role|peran?, content|isi, avatar_url|foto?, rating?, sort_order|urutan?, is_active?}
 * PUT /api/testimonials?id= — pustakawan+ (termasuk approve moderasi via is_active)
 * DELETE /api/testimonials?id= — admin
 * Kolom migrasi 0001: name, role, content, avatar_url, rating 1-5, sort_order, is_active.
 */

function toInt(v: unknown, def: number): number {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

// S-sec-rls: anon testimonial spam guard — in-memory per-IP 5/hr + honeypot.
// Bucket public read intended; anon insert is_active=FALSE by design but spammable,
// so throttle before touching Supabase. Map pruned lazily per check.
export const TESTIMONIAL_LIMIT = 5;
export const TESTIMONIAL_WINDOW_MS = 60 * 60 * 1000;
const testimonialHits = new Map<string, number[]>();

export function getTestimonialClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "anon";
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

export function checkTestimonialRateLimit(ip: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
  const windowStart = now - TESTIMONIAL_WINDOW_MS;
  const hits = (testimonialHits.get(ip) ?? []).filter((t) => t > windowStart);
  if (hits.length >= TESTIMONIAL_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((hits[0]! + TESTIMONIAL_WINDOW_MS - now) / 1000));
    testimonialHits.set(ip, hits);
    return { allowed: false, retryAfter };
  }
  hits.push(now);
  testimonialHits.set(ip, hits);
  return { allowed: true, retryAfter: 0 };
}

export function resetTestimonialRateLimit(): void {
  testimonialHits.clear();
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
      entity_type: "testimonials",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateTestimonials(): string[] {
  const done: string[] = [];
  try {
    revalidateTag("testimonials");
    done.push("testimonials");
  } catch { /* abaikan di runtime tanpa cache-tag */ }
  try {
    revalidatePath("/");
    done.push("/");
  } catch { /* abaikan */ }
  return done;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get("all");
  const id = (sp.get("id") ?? "").trim();

  // ?all=1 butuh staf (lihat data nonaktif/menunggu moderasi untuk admin).
  if (all === "1") {
    const guard = await requireStaff();
    if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  }

  // ?id= — satu testimoni (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from("testimonials").select("*").eq("id", id).single();
    if (error || !data) return jsonError("NOT_FOUND", "Testimoni tidak ditemukan.", 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== "1") {
      const guard = await requireStaff();
      if ("errorResponse" in guard && guard.errorResponse) return jsonError("NOT_FOUND", "Testimoni tidak ditemukan.", 404);
    }
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": all === "1" ? "no-store" : "public, s-maxage=300" } }
    );
  }

  let query = supabase
    .from("testimonials")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (all !== "1") query = query.eq("is_active", true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`name.ilike.%${clean}%,content.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil testimoni.", 500, error.message);
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
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  if (typeof body.website === "string" && body.website.trim() !== "") {
    return jsonError("SPAM_DETECTED", "Permintaan ditolak.", 422);
  }

  const ip = getTestimonialClientIp(req);
  const limit = checkTestimonialRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak testimoni. Coba lagi nanti." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const name = String(body.name ?? body.nama ?? "").trim();
  if (!name) return jsonError("VALIDATION", "name/nama wajib diisi.", 422);
  const content = String(body.content ?? body.isi ?? body.testimoni ?? body.pesan ?? "").trim();
  if (!content) return jsonError("VALIDATION", "content/isi wajib diisi.", 422);
  const rating = toInt(body.rating, 5);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonError("VALIDATION", "rating harus bilangan bulat 1-5.", 422);
  }

  // Deteksi staf secara opsional: staf boleh langsung aktif + atur urutan,
  // non-staf (anon/member) selalu masuk sebagai nonaktif untuk moderasi.
  const maybeStaff = await requireStaff();
  const staff = "errorResponse" in maybeStaff ? null : maybeStaff;
  const supabase = staff ? (staff as { supabase: ReturnType<typeof createClient> }).supabase : createClient();
  const staffUser = staff ? (staff as { user: { id: string } }).user : null;

  const sort_order = staff ? toInt(body.sort_order ?? body.urutan, 0) : 0;
  if (!Number.isInteger(sort_order)) return jsonError("VALIDATION", "sort_order/urutan harus bilangan bulat.", 422);

  const { data, error } = await supabase
    .from("testimonials")
    .insert({
      name,
      role: ((body.role ?? body.peran) as string | null) ?? null,
      content,
      avatar_url: ((body.avatar_url ?? body.foto ?? body.image_url ?? body.gambar_url) as string | null) ?? null,
      rating,
      sort_order,
      is_active: staff ? (body.is_active === undefined ? true : Boolean(body.is_active)) : false,
    })
    .select()
    .single();

  if (error) return jsonError("SAVE_FAILED", "Gagal menambah testimoni.", 500, error.message);

  // Anon: tidak tulis log staf & tidak revalidate (baris nonaktif tak mengubah halaman publik).
  if (!staff) return NextResponse.json({ data, revalidated: [] as string[] }, { status: 201 });

  await writeLog(supabase, staffUser?.id, "testimonials.create", (data as { id: string }).id, { name });
  return NextResponse.json({ data, revalidated: revalidateTestimonials() }, { status: 201 });
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
    const name = String(body.name ?? body.nama ?? "").trim();
    if (!name) return jsonError("VALIDATION", "name/nama tidak boleh kosong.", 422);
    payload.name = name;
  }
  if (body.role !== undefined || body.peran !== undefined) {
    payload.role = (body.role ?? body.peran) as string | null;
  }
  if (body.content !== undefined || body.isi !== undefined || body.testimoni !== undefined || body.pesan !== undefined) {
    const content = String(body.content ?? body.isi ?? body.testimoni ?? body.pesan ?? "").trim();
    if (!content) return jsonError("VALIDATION", "content/isi tidak boleh kosong.", 422);
    payload.content = content;
  }
  if (body.avatar_url !== undefined || body.foto !== undefined || body.image_url !== undefined || body.gambar_url !== undefined) {
    payload.avatar_url = (body.avatar_url ?? body.foto ?? body.image_url ?? body.gambar_url) as string | null;
  }
  if (body.rating !== undefined) {
    const rating = toInt(body.rating, 5);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonError("VALIDATION", "rating harus bilangan bulat 1-5.", 422);
    }
    payload.rating = rating;
  }
  if (body.sort_order !== undefined || body.urutan !== undefined) {
    const sort_order = toInt(body.sort_order ?? body.urutan, 0);
    if (!Number.isInteger(sort_order)) return jsonError("VALIDATION", "sort_order/urutan harus bilangan bulat.", 422);
    payload.sort_order = sort_order;
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  if (Object.keys(payload).length === 0) return jsonError("VALIDATION", "Tidak ada field yang diupdate.", 422);

  const { data, error } = await supabase.from("testimonials").update(payload).eq("id", id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate testimoni.", 500, error.message);

  await writeLog(supabase, user?.id, "testimonials.update", id, payload);
  return NextResponse.json({ data, revalidated: revalidateTestimonials() });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as { supabase: ReturnType<typeof createClient>; user: { id: string } };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { error } = await supabase.from("testimonials").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus testimoni.", 500, error.message);

  await writeLog(supabase, user?.id, "testimonials.delete", id);
  return NextResponse.json({ message: "Testimoni dihapus.", revalidated: revalidateTestimonials() });
}
