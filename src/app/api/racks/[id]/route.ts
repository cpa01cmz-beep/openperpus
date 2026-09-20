import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/racks/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/racks/[id] — pustakawan+
 * DELETE /api/racks/[id] — admin (409 bila dipakai buku)
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
      entity_type: 'racks',
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
    revalidateTag('racks');
    done.push('racks');
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
  const { data, error } = await supabase.from('racks').select('*').eq('id', params.id).single();
  if (error || !data) {
    log.warn('racks.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Rak tidak ditemukan.', 404, { requestId: log.requestId });
  }

  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Rak tidak ditemukan.', 404);
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
  if (body.code !== undefined || body.kode !== undefined) {
    const code = String(body.code ?? body.kode ?? '').trim();
    if (!code) return jsonError('VALIDATION', 'kode/code tidak boleh kosong.', 422);
    payload.code = code;
  }
  if (body.name !== undefined || body.nama !== undefined) {
    const name = String(body.name ?? body.nama ?? '').trim();
    if (!name) return jsonError('VALIDATION', 'nama/name tidak boleh kosong.', 422);
    payload.name = name;
  }
  if (body.location !== undefined || body.keterangan !== undefined || body.lantai !== undefined) {
    const v = body.location ?? body.keterangan ?? body.lantai;
    payload.location =
      v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
  }
  if (body.capacity !== undefined) {
    if (body.capacity === null || body.capacity === '') payload.capacity = null;
    else {
      const c = Number(body.capacity);
      if (!Number.isInteger(c) || c < 0)
        return jsonError('VALIDATION', 'capacity harus bilangan bulat >= 0.', 422);
      payload.capacity = c;
    }
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase
    .from('racks')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('racks.id.conflict', { detail: error.message });
      return jsonError('CONFLICT', 'Kode rak sudah dipakai.', 409, { requestId: log.requestId });
    }
    log.error('racks.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate rak.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'racks.update', params.id, payload);
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
    .eq('rack_id', params.id);
  if ((count ?? 0) > 0) return jsonError('CONFLICT', 'Rak dipakai buku, tidak bisa dihapus.', 409);

  const { error } = await supabase.from('racks').delete().eq('id', params.id);
  if (error) {
    log.error('racks.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus rak.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'racks.delete', params.id);
  return NextResponse.json({ message: 'Rak dihapus.', revalidated: revalidated() });
}
