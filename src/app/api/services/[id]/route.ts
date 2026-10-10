import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/services/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/services/[id] — pustakawan+
 * DELETE /api/services/[id] — admin
 */

export const SERVICES_TAG = 'services';

const ICONS = ['book', 'catalog', 'users', 'clock', 'info', 'star'] as const;

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
      entity_type: 'services',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

function revalidateServices(): string[] {
  const done: string[] = [];
  try {
    revalidateTag(SERVICES_TAG, 'max');
    done.push(SERVICES_TAG);
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/');
    done.push('/');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/layanan');
    done.push('/layanan');
  } catch {
    /* abaikan */
  }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const supabase = createClient();
  const { data, error } = await supabase.from('services').select('*').eq('id', id).single();
  if (error || !data) {
    log.warn('services.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Layanan tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Layanan tidak ditemukan.', 404);
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.title !== undefined || body.nama !== undefined) {
    const title = String(body.title ?? body.nama ?? '').trim();
    if (!title) return jsonError('VALIDATION', 'title/nama tidak boleh kosong.', 422);
    payload.title = title;
  }
  if (body.description !== undefined || body.deskripsi !== undefined) {
    payload.description = String(body.description ?? body.deskripsi ?? '').trim();
  }
  if (body.icon !== undefined) {
    const icon = String(body.icon ?? '').trim();
    if (!(ICONS as readonly string[]).includes(icon)) {
      return jsonError('VALIDATION', 'icon harus: book|catalog|users|clock|info|star.', 422);
    }
    payload.icon = icon;
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
    .from('services')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    log.error('services.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate layanan.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'services.update', id, payload);
  return NextResponse.json({ data, revalidated: revalidateServices() });
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

  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) {
    log.error('services.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus layanan.', 500, {
      requestId: log.requestId,
    });
  }

  await writeLog(supabase, user?.id, 'services.delete', id);
  return NextResponse.json({ message: 'Layanan dihapus.', revalidated: revalidateServices() });
}
