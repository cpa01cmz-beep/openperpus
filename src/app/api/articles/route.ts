import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/articles?page=&per_page=&q=&status= (staf; publik via helper lib)
 * POST /api/articles { title, content_md|konten, excerpt|ringkasan, cover_url|gambar_url, category, status }
 * PUT /api/articles/{id} | DELETE /api/articles/{id} (admin) — issue #54: ?id= dihapus
 * Kolom migrasi: title, slug, excerpt, content_md, cover_url, category,
 * author_id, published_at, status draft|published|archived, views.
 */

const STATUSES = ['draft', 'published', 'archived'] as const;

async function writeLog(
  supabase: ReturnType<typeof createClient>,
  userId: string | undefined,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId ?? null,
      action,
      entity_type: 'articles',
      entity_id: entityId,
      metadata,
    });
  } catch {}
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 10);
  const status = (sp.get('status') ?? '').trim();
  const all = (sp.get('all') ?? '').trim();

  // Publik bila ?status= kosong atau published; draft/archived atau ?all=1 butuh staf.
  // RLS tetap jaring pengaman.
  const needsStaff = all === '1' || (status !== '' && status !== 'published');
  let supabase: ReturnType<typeof createClient>;
  if (needsStaff) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
    supabase = (guard as { supabase: ReturnType<typeof createClient> }).supabase;
  } else {
    supabase = createClient();
  }

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
  else query = query.eq('status', 'published');

  const { data, error, count } = await query;
  if (error) {
    log.error('articles.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil artikel.', 500, { requestId: log.requestId });
  }
  const total = count ?? 0;
  return NextResponse.json({
    data,
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  });
}

export async function POST(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
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
    if ((error as { code?: string }).code === '23505') {
      log.warn('articles.conflict', {
        detail: (error as { message?: string }).message ?? 'conflict',
      });
      return jsonError('CONFLICT', 'Slug sudah dipakai.', 409, { requestId: log.requestId });
    }
    log.error('articles.save_failed', {
      detail: (error as { message?: string }).message ?? 'save-failed',
    });
    return jsonError('SAVE_FAILED', 'Gagal menambah artikel.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'articles.create', (data as { id: string }).id, {
    title,
    status,
  });
  return NextResponse.json({ data }, { status: 201 });
}
