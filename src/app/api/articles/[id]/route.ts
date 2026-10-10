import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/articles/[id] — publik bila published (staf boleh semua).
 * PUT /api/articles/[id] — pustakawan+
 * DELETE /api/articles/[id] — admin
 *
 * Satu transport ID (issue #54): id hanya via path REST, bukan ?id=.
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
  } catch {
    /* best-effort */
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));

  const supabase = createClient();
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID artikel tidak valid (harus UUID).', 400);
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).single();
  if (error || !data) {
    log.warn('articles.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Artikel tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh published; staf boleh draft/archived.
  if ((data as { status: string }).status !== 'published') {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Artikel tidak ditemukan.', 404);
  }
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID artikel tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID artikel tidak valid (harus UUID).', 400);

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
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('articles.id.conflict', { detail: error.message });
      return jsonError('CONFLICT', 'Slug sudah dipakai.', 409, { requestId: log.requestId });
    }
    log.error('articles.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate artikel.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'articles.update', id, payload);
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID artikel tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID artikel tidak valid (harus UUID).', 400);

  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) {
    log.error('articles.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus artikel.', 500, {
      requestId: log.requestId,
    });
  }
  await writeLog(supabase, user?.id, 'articles.delete', id);
  return NextResponse.json({ message: 'Artikel dihapus.' });
}
