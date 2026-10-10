import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/menus?page=&per_page=&q=&position= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif).
 * POST /api/menus — pustakawan+ {label|nama, url|link, position|posisi?, parent_id?, sort_order|urutan?, is_active?, target?}
 * PUT /api/menus/{id} — pustakawan+ (satu transport ID, issue #54: ?id= dihapus)
 * DELETE /api/menus/{id} — admin
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
    revalidateTag('menus', 'max');
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
