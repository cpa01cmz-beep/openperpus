import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';

/**
 * GET /api/articles?page=&per_page=&q=&status= (staf; publik via helper lib)
 * POST /api/articles { title, content_md|konten, excerpt|ringkasan, cover_url|gambar_url, category, status }
 * PUT /api/articles?id= | DELETE /api/articles?id= (admin)
 * Kolom migrasi: title, slug, excerpt, content_md, cover_url, category,
 * author_id, published_at, status draft|published|archived, views.
 */

const STATUSES = ['draft', 'published', 'archived'] as const;

export async function GET(req: Request) {
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 10);
  const status = (sp.get('status') ?? '').trim();

  let query = supabase
    .from('articles')
    .select(
      'id,title,slug,excerpt,cover_url,category,author_id,published_at,status,views,created_at,updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`title.ilike.%${clean}%,excerpt.ilike.%${clean}%`);
  }
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return jsonError('FETCH_FAILED', 'Gagal mengambil artikel.', 500, error.message);
  const total = count ?? 0;
  return NextResponse.json({
    data,
    meta: { page, per_page: perPage, total },
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  });
}

export async function POST(req: Request) {
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const title = (((body.title ?? body.judul) as string) ?? '').trim();
  const content_md = (((body.content_md ?? body.konten ?? body.content) as string) ?? '').trim();
  if (!title) return jsonError('VALIDATION', 'title wajib diisi.', 422);
  if (!content_md) return jsonError('VALIDATION', 'content_md/konten wajib diisi.', 422);

  const status = ((body.status as string) ?? 'draft') as string;
  if (!(STATUSES as readonly string[]).includes(status)) {
    return jsonError('VALIDATION', 'status harus: draft|published|archived.', 422);
  }

  const slug =
    typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(title);

  const { data, error } = await supabase
    .from('articles')
    .insert({
      title,
      slug,
      excerpt: ((body.excerpt ?? body.ringkasan) as string | null) ?? null,
      content_md,
      cover_url: ((body.cover_url ?? body.gambar_url) as string | null) ?? null,
      category: (body.category as string | null) ?? null,
      author_id: user.id,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505')
      return jsonError('CONFLICT', 'Slug sudah dipakai.', 409, error.message);
    return jsonError('SAVE_FAILED', 'Gagal menambah artikel.', 500, error.message);
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(req: Request) {
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.title !== undefined || body.judul !== undefined)
    payload.title = ((body.title ?? body.judul) as string).trim();
  if (body.content_md !== undefined || body.konten !== undefined || body.content !== undefined) {
    payload.content_md = ((body.content_md ?? body.konten ?? body.content) as string).trim();
  }
  if (body.excerpt !== undefined || body.ringkasan !== undefined)
    payload.excerpt = (body.excerpt ?? body.ringkasan) as string | null;
  if (body.cover_url !== undefined || body.gambar_url !== undefined)
    payload.cover_url = (body.cover_url ?? body.gambar_url) as string | null;
  if (body.category !== undefined) payload.category = body.category;
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(body.status as string)) {
      return jsonError('VALIDATION', 'status harus: draft|published|archived.', 422);
    }
    payload.status = body.status;
    if (body.status === 'published') payload.published_at = new Date().toISOString();
  }
  if (typeof payload.title === 'string' && payload.title) {
    payload.slug =
      typeof body.slug === 'string' && body.slug.trim()
        ? slugify(body.slug)
        : slugify(payload.title as string);
  } else if (typeof body.slug === 'string' && body.slug.trim()) {
    payload.slug = slugify(body.slug);
  }

  const { data, error } = await supabase
    .from('articles')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) return jsonError('SAVE_FAILED', 'Gagal mengupdate artikel.', 500, error.message);
  return NextResponse.json({ data });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) return jsonError('DELETE_FAILED', 'Gagal menghapus artikel.', 500, error.message);
  return NextResponse.json({ message: 'Artikel dihapus.' });
}
