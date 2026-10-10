import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/services?page=&per_page=&q= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif).
 * POST /api/services — pustakawan+ {title|nama, description|deskripsi?, icon?, sort_order|urutan?, is_active?}
 * PUT /api/services/{id} — pustakawan+ (satu transport ID, issue #54: ?id= dihapus)
 * DELETE /api/services/{id} — admin
 * Kolom migrasi 0021: title, description, icon book|catalog|users|clock|info|star,
 * sort_order, is_active.
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
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateServices(): string[] {
  const done: string[] = [];
  try {
    revalidateTag(SERVICES_TAG, 'max');
    done.push(SERVICES_TAG);
  } catch {
    /* abaikan di runtime tanpa cache-tag */
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

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get('all');
  const id = (sp.get('id') ?? '').trim();

  // ?all=1 butuh staf (lihat data nonaktif untuk admin).
  if (all === '1') {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  }

  // ?id= — satu layanan (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from('services').select('*').eq('id', id).single();
    if (error || !data) return jsonError('NOT_FOUND', 'Layanan tidak ditemukan.', 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== '1') {
      const guard = await requireStaff();
      if ('errorResponse' in guard && guard.errorResponse)
        return jsonError('NOT_FOUND', 'Layanan tidak ditemukan.', 404);
    }
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': all === '1' ? 'no-store' : 'public, s-maxage=300' } }
    );
  }

  let query = supabase
    .from('services')
    .select('*', { count: 'exact' })
    .order('sort_order', { ascending: true })
    .range(from, to);

  if (all !== '1') query = query.eq('is_active', true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`title.ilike.%${clean}%,description.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('services.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil layanan.', 500, { requestId: log.requestId });
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

  const title = String(body.title ?? body.nama ?? '').trim();
  if (!title) return jsonError('VALIDATION', 'title/nama wajib diisi.', 422);
  const description = String(body.description ?? body.deskripsi ?? '').trim();
  const icon = String(body.icon ?? 'book').trim();
  if (!(ICONS as readonly string[]).includes(icon)) {
    return jsonError('VALIDATION', 'icon harus: book|catalog|users|clock|info|star.', 422);
  }
  const sort_order = toInt(body.sort_order ?? body.urutan, 0);
  if (!Number.isInteger(sort_order))
    return jsonError('VALIDATION', 'sort_order/urutan harus bilangan bulat.', 422);

  const { data, error } = await supabase
    .from('services')
    .insert({
      title,
      description,
      icon,
      sort_order,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    log.error('services.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah layanan.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'services.create', (data as { id: string }).id, { title });
  return NextResponse.json({ data, revalidated: revalidateServices() }, { status: 201 });
}
