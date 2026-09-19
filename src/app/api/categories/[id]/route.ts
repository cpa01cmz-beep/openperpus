import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/categories/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/categories/[id] — pustakawan+
 * DELETE /api/categories/[id] — admin (409 bila dipakai buku)
 */

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
      entity_type: 'categories',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

function revalidated(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('categories');
    done.push('categories');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/katalog');
    done.push('/katalog');
  } catch {
    /* abaikan */
  }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const supabase = createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !data) {
    log.warn('categories.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Kategori tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Kategori tidak ditemukan.', 404);
  }
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(req.headers));
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

  const payload: Record<string, unknown> = {};
  if (body.name !== undefined || body.nama !== undefined) {
    const name = String(body.name ?? body.nama ?? '').trim();
    if (!name) return jsonError('VALIDATION', 'nama/name tidak boleh kosong.', 422);
    payload.name = name;
    payload.slug =
      typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(name);
  } else if (typeof body.slug === 'string' && body.slug.trim()) {
    payload.slug = slugify(body.slug);
  }
  if (body.description !== undefined || body.deskripsi !== undefined)
    payload.description = (body.description ?? body.deskripsi) as string | null;
  if (body.cover_url !== undefined || body.icon !== undefined || body.gambar_url !== undefined) {
    payload.cover_url = (body.cover_url ?? body.icon ?? body.gambar_url) as string | null;
  }
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(Number(body.sort_order)))
      return jsonError('VALIDATION', 'sort_order harus bilangan bulat.', 422);
    payload.sort_order = Number(body.sort_order);
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase
    .from('categories')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('categories.id.conflict', { detail: error.message });
      return jsonError('CONFLICT', 'Nama/slug kategori sudah dipakai.', 409, {
        requestId: log.requestId,
      });
    }
    log.error('categories.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate kategori.', 500, {
      requestId: log.requestId,
    });
  }

  await writeLog(supabase, user?.id, 'categories.update', params.id, payload);
  return NextResponse.json({ data, revalidated: revalidated() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const { count } = await supabase
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', params.id);
  if ((count ?? 0) > 0)
    return jsonError('CONFLICT', 'Kategori dipakai buku, tidak bisa dihapus.', 409);

  const { error } = await supabase.from('categories').delete().eq('id', params.id);
  if (error) {
    log.error('categories.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus kategori.', 500, {
      requestId: log.requestId,
    });
  }

  await writeLog(supabase, user?.id, 'categories.delete', params.id);
  return NextResponse.json({ message: 'Kategori dihapus.', revalidated: revalidated() });
}
