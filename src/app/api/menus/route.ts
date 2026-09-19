import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/menus?page=&per_page=&q=&position= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif). ?id= untuk satu menu.
 * POST /api/menus — pustakawan+ {label|nama, url|link, position|posisi?, parent_id?, sort_order|urutan?, is_active?, target?}
 * PUT /api/menus?id= — pustakawan+
 * DELETE /api/menus?id= — admin
 * Kolom migrasi 0001: label, url, position header|footer|sidebar, parent_id (self-ref),
 * sort_order, is_active, target _self|_blank.
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
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateMenus(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('menus');
    done.push('menus');
  } catch {
    /* abaikan di runtime tanpa cache-tag */
  }
  try {
    revalidatePath('/');
    done.push('/');
  } catch {
    /* abaikan */
  }
  return done;
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get('all');
  const id = (sp.get('id') ?? '').trim();
  const position = (sp.get('position') ?? sp.get('posisi') ?? '').trim();

  // ?all=1 butuh staf (lihat data nonaktif untuk admin).
  if (all === '1') {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  }
  if (position && !(POSITIONS as readonly string[]).includes(position)) {
    return jsonError('VALIDATION', 'position harus: header|footer|sidebar.', 422);
  }

  // ?id= — satu menu (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from('menus').select('*').eq('id', id).single();
    if (error || !data) return jsonError('NOT_FOUND', 'Menu tidak ditemukan.', 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== '1') {
      const guard = await requireStaff();
      if ('errorResponse' in guard && guard.errorResponse)
        return jsonError('NOT_FOUND', 'Menu tidak ditemukan.', 404);
    }
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': all === '1' ? 'no-store' : 'public, s-maxage=300' } }
    );
  }

  let query = supabase
    .from('menus')
    .select('*', { count: 'exact' })
    .order('position', { ascending: true })
    .order('sort_order', { ascending: true })
    .range(from, to);

  if (all !== '1') query = query.eq('is_active', true);
  if (position) query = query.eq('position', position);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`label.ilike.%${clean}%,url.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('menus.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil menu.', 500, { requestId: log.requestId });
  }
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      meta: { page, per_page: perPage, total },
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { 'Cache-Control': all === '1' ? 'no-store' : 'public, s-maxage=300' } }
  );
}

export async function POST(req: Request) {
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

  const label = String(body.label ?? body.nama ?? '').trim();
  if (!label) return jsonError('VALIDATION', 'label/nama wajib diisi.', 422);
  const url = String(body.url ?? body.link ?? '').trim();
  if (!url) return jsonError('VALIDATION', 'url/link wajib diisi.', 422);
  const position = String(body.position ?? body.posisi ?? 'header').trim();
  if (!(POSITIONS as readonly string[]).includes(position)) {
    return jsonError('VALIDATION', 'position/posisi harus: header|footer|sidebar.', 422);
  }
  const target = String(body.target ?? '_self').trim();
  if (!(TARGETS as readonly string[]).includes(target)) {
    return jsonError('VALIDATION', 'target harus: _self|_blank.', 422);
  }
  const sort_order = toInt(body.sort_order ?? body.urutan, 0);
  if (!Number.isInteger(sort_order))
    return jsonError('VALIDATION', 'sort_order/urutan harus bilangan bulat.', 422);

  const parentRaw = body.parent_id ?? null;
  if (parentRaw !== null && parentRaw !== undefined && parentRaw !== '' && !isUuid(parentRaw)) {
    return jsonError('VALIDATION', 'parent_id harus UUID valid atau null.', 422);
  }

  const { data, error } = await supabase
    .from('menus')
    .insert({
      label,
      url,
      position,
      parent_id: parentRaw === '' ? null : ((parentRaw as string | null) ?? null),
      sort_order,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      target,
    })
    .select()
    .single();

  if (error) {
    log.error('menus.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah menu.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'menus.create', (data as { id: string }).id, { label, url });
  return NextResponse.json({ data, revalidated: revalidateMenus() }, { status: 201 });
}

export async function PUT(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

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
    if (typeof parentRaw === 'string' && parentRaw === id) {
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
    .eq('id', id)
    .select()
    .single();
  if (error) {
    log.error('menus.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate menu.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'menus.update', id, payload);
  return NextResponse.json({ data, revalidated: revalidateMenus() });
}

export async function DELETE(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

  // Tolak hapus menu yang masih punya anak (hindari orphan; ON DELETE CASCADE di DB sebagai jaring pengaman).
  const { count } = await supabase
    .from('menus')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id);
  if ((count ?? 0) > 0)
    return jsonError('CONFLICT', 'Menu masih punya sub-menu, pindahkan/hapus dulu anaknya.', 409);

  const { error } = await supabase.from('menus').delete().eq('id', id);
  if (error) {
    log.error('menus.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus menu.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'menus.delete', id);
  return NextResponse.json({ message: 'Menu dihapus.', revalidated: revalidateMenus() });
}
