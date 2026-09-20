import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/testimonials/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/testimonials/[id] — pustakawan+ (termasuk approve moderasi via is_active)
 * DELETE /api/testimonials/[id] — admin
 */

function toInt(v: unknown, def: number): number {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
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
      entity_type: 'testimonials',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

function revalidateTestimonials(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('testimonials');
    done.push('testimonials');
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

export async function GET(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const supabase = createClient();
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !data) {
    log.warn('testimonials.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Testimoni tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Testimoni tidak ditemukan.', 404);
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
    if (!name) return jsonError('VALIDATION', 'name/nama tidak boleh kosong.', 422);
    payload.name = name;
  }
  if (body.role !== undefined || body.peran !== undefined) {
    payload.role = (body.role ?? body.peran) as string | null;
  }
  if (
    body.content !== undefined ||
    body.isi !== undefined ||
    body.testimoni !== undefined ||
    body.pesan !== undefined
  ) {
    const content = String(body.content ?? body.isi ?? body.testimoni ?? body.pesan ?? '').trim();
    if (!content) return jsonError('VALIDATION', 'content/isi tidak boleh kosong.', 422);
    payload.content = content;
  }
  if (
    body.avatar_url !== undefined ||
    body.foto !== undefined ||
    body.image_url !== undefined ||
    body.gambar_url !== undefined
  ) {
    payload.avatar_url = (body.avatar_url ?? body.foto ?? body.image_url ?? body.gambar_url) as
      string | null;
  }
  if (body.rating !== undefined) {
    const rating = toInt(body.rating, 5);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonError('VALIDATION', 'rating harus bilangan bulat 1-5.', 422);
    }
    payload.rating = rating;
  }
  if (body.sort_order !== undefined || body.urutan !== undefined) {
    const sort_order = toInt(body.sort_order ?? body.urutan, 0);
    if (!Number.isInteger(sort_order))
      return jsonError('VALIDATION', 'sort_order/urutan harus bilangan bulat.', 422);
    payload.sort_order = sort_order;
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  if (Object.keys(payload).length === 0)
    return jsonError('VALIDATION', 'Tidak ada field yang diupdate.', 422);

  const { data, error } = await supabase
    .from('testimonials')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    log.error('testimonials.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate testimoni.', 500, {
      requestId: log.requestId,
    });
  }

  await writeLog(supabase, user?.id, 'testimonials.update', params.id, payload);
  return NextResponse.json({ data, revalidated: revalidateTestimonials() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const { error } = await supabase.from('testimonials').delete().eq('id', params.id);
  if (error) {
    log.error('testimonials.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus testimoni.', 500, {
      requestId: log.requestId,
    });
  }

  await writeLog(supabase, user?.id, 'testimonials.delete', params.id);
  return NextResponse.json({
    message: 'Testimoni dihapus.',
    revalidated: revalidateTestimonials(),
  });
}
