import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/racks?page=&per_page=&q= — publik (filter OPAC, hanya is_active).
 *   Staf: ?all=1 untuk lihat semua.
 * POST /api/racks — pustakawan+ {kode|code, nama|name, lantai?|keterangan?|location?, capacity?, is_active?}
 * PUT /api/racks/{id} — pustakawan+ (satu transport ID, issue #54: ?id= dihapus)
 * DELETE /api/racks/{id} — admin (409 bila dipakai buku)
 * Kolom migrasi 0001: code UNIQUE, name, location, capacity, is_active.
 */

function pickCode(body: Record<string, unknown>): string {
  return String(body.code ?? body.kode ?? '').trim();
}

function pickName(body: Record<string, unknown>): string {
  return String(body.name ?? body.nama ?? '').trim();
}

function pickLocation(body: Record<string, unknown>): string | null {
  const v = body.location ?? body.keterangan ?? body.lantai;
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
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
      entity_type: 'racks',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

function revalidateRacks(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('racks', 'max');
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

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const supabase = createClient();
  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const all = sp.get('all');

  if (all === '1') {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  }

  let query = supabase
    .from('racks')
    .select('*', { count: 'exact' })
    .order('code', { ascending: true })
    .range(from, to);

  if (all !== '1') query = query.eq('is_active', true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean)
      query = query.or(`code.ilike.%${clean}%,name.ilike.%${clean}%,location.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('racks.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil rak.', 500, { requestId: log.requestId });
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

  const code = pickCode(body);
  const name = pickName(body);
  if (!code) return jsonError('VALIDATION', 'kode/code wajib diisi.', 422);
  if (!name) return jsonError('VALIDATION', 'nama/name wajib diisi.', 422);
  if (code.length > 50) return jsonError('VALIDATION', 'kode maksimal 50 karakter.', 422);

  const capacity =
    body.capacity === undefined || body.capacity === null || body.capacity === ''
      ? null
      : Number(body.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
    return jsonError('VALIDATION', 'capacity harus bilangan bulat >= 0.', 422);
  }

  const { data, error } = await supabase
    .from('racks')
    .insert({
      code,
      name,
      location: pickLocation(body),
      capacity,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('racks.conflict', { detail: error.message });
      return jsonError('CONFLICT', 'Kode rak sudah dipakai.', 409, { requestId: log.requestId });
    }
    log.error('racks.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah rak.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'racks.create', (data as { id: string }).id, { code });
  return NextResponse.json({ data, revalidated: revalidateRacks() }, { status: 201 });
}
