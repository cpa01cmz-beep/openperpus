import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/menus/[id] — publik bila is_active (staf boleh semua).
 * PUT /api/menus/[id] — pustakawan+
 * DELETE /api/menus/[id] — admin (409 bila masih punya sub-menu)
 */

const POSITIONS = ['header', 'footer', 'sidebar'] as const;
const TARGETS = ['_self', '_blank'] as const;

function toInt(v: unknown, def: number): number {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function isUuid(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
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
      entity_type: 'menus',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

function revalidateMenus(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('menus');
    done.push('menus');
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
  const { data, error } = await supabase.from('menus').select('*').eq('id', params.id).single();
  if (error || !data) {
    log.warn('menus.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Menu tidak ditemukan.', 404, { requestId: log.requestId });
  }

  // Anon hanya boleh yang aktif; staf boleh semua.
  if ((data as { is_active: boolean }).is_active !== true) {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse)
      return jsonError('NOT_FOUND', 'Menu tidak ditemukan.', 404);
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
  if (body.label !== undefined || body.nama !== undefined) {
    const label = String(body.label ?? body.nama ?? '').trim();
    if (!label) return jsonError('VALIDATION', 'label/nama tidak boleh kosong.', 422);
    payload.label = label;
  }
  if (body.url !== undefined || body.link !== undefined) {
    const url = String(body.url ?? body.link ?? '').trim();
    if (!url) return jsonError('VALIDATION', 'url/link tidak boleh kosong.', 422);
    payload.url = url;
  }
  if (body.position !== undefined || body.posisi !== undefined) {
    const position = String(body.position ?? body.posisi ?? '').trim();
    if (!(POSITIONS as readonly string[]).includes(position)) {
      return jsonError('VALIDATION', 'position/posisi harus: header|footer|sidebar.', 422);
    }
    payload.position = position;
  }
  if (body.target !== undefined) {
    const target = String(body.target ?? '').trim();
    if (!(TARGETS as readonly string[]).includes(target)) {
      return jsonError('VALIDATION', 'target harus: _self|_blank.', 422);
    }
    payload.target = target;
  }
  if (body.parent_id !== undefined) {
    const parentRaw = body.parent_id;
    if (parentRaw !== null && parentRaw !== '' && !isUuid(parentRaw)) {
      return jsonError('VALIDATION', 'parent_id harus UUID valid atau null.', 422);
    }
    if (typeof parentRaw === 'string' && parentRaw === params.id) {
      return jsonError('VALIDATION', 'parent_id tidak boleh merujuk ke dirinya sendiri.', 422);
    }
    payload.parent_id = parentRaw === '' ? null : (parentRaw as string | null);
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
    .from('menus')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    log.error('menus.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate menu.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'menus.update', params.id, payload);
  return NextResponse.json({ data, revalidated: revalidateMenus() });
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
    .from('menus')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', params.id);
  if ((count ?? 0) > 0)
    return jsonError('CONFLICT', 'Menu masih punya sub-menu, pindahkan/hapus dulu anaknya.', 409);

  const { error } = await supabase.from('menus').delete().eq('id', params.id);
  if (error) {
    log.error('menus.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus menu.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'menus.delete', params.id);
  return NextResponse.json({ message: 'Menu dihapus.', revalidated: revalidateMenus() });
}
