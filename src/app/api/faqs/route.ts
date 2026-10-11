import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/faqs?page=&per_page=&q=&category= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif).
 * POST /api/faqs — pustakawan+ {question|pertanyaan, answer|jawaban, category|kategori?, sort_order|urutan?, is_active?}
 * PUT /api/faqs/{id} — pustakawan+ (satu transport ID, issue #54: ?id= dihapus)
 * DELETE /api/faqs/{id} — admin
 * Kolom migrasi 0001: question, answer, category, sort_order, is_active.
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
      entity_type: 'faqs',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidateFaqs(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('faqs', 'max');
    done.push('faqs');
  } catch {
    /* abaikan di runtime tanpa cache-tag */
  }
  try {
    revalidatePath('/faq');
    done.push('/faq');
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
  const category = (sp.get('category') ?? '').trim();

  // ?all=1 butuh staf (lihat data nonaktif untuk admin).
  if (all === '1') {
    const guard = await requireStaff();
    if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  }

  // ?id= — satu FAQ (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from('faqs').select('*').eq('id', id).single();
    if (error || !data) return jsonError('NOT_FOUND', 'FAQ tidak ditemukan.', 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== '1') {
      const guard = await requireStaff();
      if ('errorResponse' in guard && guard.errorResponse)
        return jsonError('NOT_FOUND', 'FAQ tidak ditemukan.', 404);
    }
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': all === '1' ? 'no-store' : 'public, s-maxage=300' } }
    );
  }

  let query = supabase
    .from('faqs')
    .select('*', { count: 'exact' })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .range(from, to);

  if (all !== '1') query = query.eq('is_active', true);
  if (category) query = query.eq('category', category);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`question.ilike.%${clean}%,answer.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('faqs.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil FAQ.', 500, { requestId: log.requestId });
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
  const guard = await requireStaff();
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

  const question = String(body.question ?? body.pertanyaan ?? '').trim();
  if (!question) return jsonError('VALIDATION', 'question/pertanyaan wajib diisi.', 422);
  const answer = String(body.answer ?? body.jawaban ?? '').trim();
  if (!answer) return jsonError('VALIDATION', 'answer/jawaban wajib diisi.', 422);
  const sort_order = toInt(body.sort_order ?? body.urutan, 0);
  if (!Number.isInteger(sort_order))
    return jsonError('VALIDATION', 'sort_order/urutan harus bilangan bulat.', 422);

  const { data, error } = await supabase
    .from('faqs')
    .insert({
      question,
      answer,
      category: ((body.category ?? body.kategori) as string | null) ?? null,
      sort_order,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    log.error('faqs.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah FAQ.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'faqs.create', (data as { id: string }).id, { question });
  return NextResponse.json({ data, revalidated: revalidateFaqs() }, { status: 201 });
}
