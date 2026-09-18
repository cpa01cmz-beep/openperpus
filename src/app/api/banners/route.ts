import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, jsonError } from "@/lib/supabase/auth";

/**
 * GET /api/banners — urut sort_order (staf; publik via helper lib)
 * POST /api/banners { title|judul, subtitle|subjudul, image_url|gambar_url, link|link_url, sort_order|urutan, is_active }
 * PUT /api/banners?id= | DELETE /api/banners?id= (admin untuk hapus; tulis staf)
 * Kolom migrasi: title, subtitle, image_url, link, sort_order, is_active.
 */

export async function GET() {
  const guard = await requireStaff();
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { data, error } = await supabase.from("banners").select("*").order("sort_order", { ascending: true });
  if (error) return jsonError("FETCH_FAILED", "Gagal mengambil banner.", 500, error.message);
  return NextResponse.json({ data });
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

  const title = ((body.title ?? body.judul) as string ?? "").trim();
  const image_url = ((body.image_url ?? body.gambar_url) as string ?? "").trim();
  if (!title) return jsonError("VALIDATION", "title/judul wajib diisi.", 422);
  if (!image_url) return jsonError("VALIDATION", "image_url/gambar_url wajib diisi.", 422);

  const { data, error } = await supabase
    .from("banners")
    .insert({
      title,
      subtitle: ((body.subtitle ?? body.subjudul) as string | null) ?? null,
      image_url,
      link: ((body.link ?? body.link_url) as string | null) ?? null,
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : body.urutan !== undefined ? Number(body.urutan) : 0,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) return jsonError("SAVE_FAILED", "Gagal menambah banner.", 500, error.message);
  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(req: Request) {
  const guard = await requireStaff(["admin", "librarian"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_JSON", "Body JSON tidak valid.", 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.title !== undefined || body.judul !== undefined) payload.title = ((body.title ?? body.judul) as string).trim();
  if (body.subtitle !== undefined || body.subjudul !== undefined) payload.subtitle = (body.subtitle ?? body.subjudul) as string | null;
  if (body.image_url !== undefined || body.gambar_url !== undefined) payload.image_url = (body.image_url ?? body.gambar_url) as string;
  if (body.link !== undefined || body.link_url !== undefined) payload.link = (body.link ?? body.link_url) as string | null;
  if (body.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
  if (body.urutan !== undefined && payload.sort_order === undefined) payload.sort_order = Number(body.urutan);
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase.from("banners").update(payload).eq("id", id).select().single();
  if (error) return jsonError("SAVE_FAILED", "Gagal mengupdate banner.", 500, error.message);
  return NextResponse.json({ data });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(["admin"]);
  if ("errorResponse" in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("VALIDATION", "Parameter ?id= wajib.", 400);

  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) return jsonError("DELETE_FAILED", "Gagal menghapus banner.", 500, error.message);
  return NextResponse.json({ message: "Banner dihapus." });
}
