import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/banners/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/banners/[id] — pustakawan+
 * DELETE /api/banners/[id] — admin
 *
 * Satu transport ID (issue #54): id hanya via path REST, bukan ?id=.
 */

function revalidateBanners(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('banners', 'max');
    done.push('banners');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/');
    done.push('/');
  } catch {
    /* abaikan */
  }
  return done;
}

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
      entity_type: 'banners',
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
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID banner tidak valid (harus UUID).', 400);
  const { data, error } = await supabase.from('banners').select('*').eq('id', id).single();
  if (error || !data) {
    log.warn('banners.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Banner tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Banner tidak ditemukan.', 404);
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
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID banner tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID banner tidak valid (harus UUID).', 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.title !== undefined || body.judul !== undefined)
    payload.title = ((body.title ?? body.judul) as string).trim();
  if (body.subtitle !== undefined || body.subjudul !== undefined)
    payload.subtitle = (body.subtitle ?? body.subjudul) as string | null;
  if (body.image_url !== undefined || body.gambar_url !== undefined)
    payload.image_url = (body.image_url ?? body.gambar_url) as string;
  if (body.link !== undefined || body.link_url !== undefined)
    payload.link = (body.link ?? body.link_url) as string | null;
  if (body.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
  if (body.urutan !== undefined && payload.sort_order === undefined)
    payload.sort_order = Number(body.urutan);
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase
    .from('banners')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    log.error('banners.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate banner.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'banners.update', id, payload);
  return NextResponse.json({ data, revalidated: revalidateBanners() });
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
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID banner tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID banner tidak valid (harus UUID).', 400);

  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) {
    log.error('banners.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus banner.', 500, {
      requestId: log.requestId,
    });
  }
  await writeLog(supabase, user?.id, 'banners.delete', id);
  return NextResponse.json({ message: 'Banner dihapus.', revalidated: revalidateBanners() });
}
