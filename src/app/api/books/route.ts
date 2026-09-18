import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError, slugify, parsePaging } from "@/lib/supabase/auth";
import { validateBook } from "@/lib/validation";
import { sanitizeIlike } from "@/lib/search";

/**
 * GET /api/books?page=&per_page=&q=&kategori=&rak=&tersedia=1&featured=1
 *  -> PUBLIK (docs/api-contract.md §2). RLS is_active yang menjaga;
 *     panel admin tetap bisa memakai endpoint yang sama.
 * POST /api/books -> admin/librarian
 * Kolom mengikuti migrasi 0001: title, slug, author(!), publisher, isbn, year,
 * category_id, rack_id, cover_url, pdf_url, description, pages, language,
 * stock_total, stock_available, featured, is_active.
 */

export async function GET(req: Request) {
  // PUBLIK: tanpa requireStaff. Keamanan dipegang RLS (is_active=true).
  const supabase = createClient();

  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 10);
  const kategori = (sp.get("kategori") ?? sp.get("category") ?? "").trim();
  const rak = (sp.get("rak") ?? "").trim();
  const tersedia = sp.get("tersedia");
  const featured = sp.get("featured");

  let query = supabase
    .from("books")
    .select("*, categories(id,name,slug), racks(code,name,location)", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`title.ilike.%${clean}%,author.ilike.%${clean}%,publisher.ilike.%${clean}%,isbn.ilike.%${clean}%`);
  }
  if (kategori) query = query.eq("category_id", kategori);
  if (rak) query = query.eq("rack_id", rak);
  if (tersedia === "1") query = query.gt("stock_available", 0);
  if (featured === "1") query = query.eq("featured", true);

  const { data, error, count } = await query;
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil buku.", 500, error.message);
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      meta: { page, per_page: perPage, total },
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}

export async function POST(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  // Alias Indonesia (docs) -> canonical
  if (body.judul && !body.title) body.title = body.judul;
  if (body.penulis && !body.author) body.author = body.penulis;
  if (body.penerbit && !body.publisher) body.publisher = body.penerbit;
  if (body.tahun && body.year === undefined) body.year = body.tahun;
  if (body.deskripsi && !body.description) body.description = body.deskripsi;
  if (body.jumlah_halaman && body.pages === undefined) body.pages = body.jumlah_halaman;
  if (body.bahasa && !body.language) body.language = body.bahasa;
  if (body.category && !body.category_id) body.category_id = body.category; // izinkan string UUID
  if (body.shelf && !body.rack_id) body.rack_id = body.shelf;

  const err = validateBook(body);
  if (err) return jsonError("VALIDATION", err, 422);

  const title = (body.title as string).trim();
  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  const stock_total = body.stock_total === undefined ? 1 : Number(body.stock_total);
  const stock_available = body.stock_available === undefined ? stock_total : Number(body.stock_available);
  if (stock_available < 0) return jsonError("VALIDATION", "stock_available tidak boleh negatif.", 422);
  if (stock_available > stock_total) return jsonError("VALIDATION", "stock_available tidak boleh melebihi stock_total.", 422);

  const { data, error } = await supabase
    .from("books")
    .insert({
      title,
      slug,
      author: (body.author as string).trim(),
      publisher: (body.publisher as string | null) ?? null,
      isbn: (body.isbn as string | null) ?? null,
      year: (body.year as number | null) ?? null,
      category_id: (body.category_id as string | null) ?? null,
      rack_id: (body.rack_id as string | null) ?? null,
      cover_url: (body.cover_url as string | null) ?? null,
      pdf_url: (body.pdf_url as string | null) ?? null,
      description: (body.description as string | null) ?? null,
      pages: (body.pages as number | null) ?? null,
      language: ((body.language as string) ?? "id"),
      stock_total,
      stock_available,
      featured: Boolean(body.featured ?? false),
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") return jsonError("CONFLICT", "Slug/ISBN sudah dipakai.", 409, error.message);
    return jsonError("SAVE_FAILED", "Gagal menambah buku.", 500, error.message);
  }
  revalidateTag("books");
  return NextResponse.json({ data }, { status: 201 });
}
