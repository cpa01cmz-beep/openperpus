import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify } from '@/lib/supabase/auth';
import { isUuid, createWriteLog } from '@/lib/api-utils';
import { validateBook } from '@/lib/validation';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

const writeLog = createWriteLog('books');

export async function GET(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { data, error } = await supabase
    .from('books')
    .select('*, categories(id,name,slug), racks(code,name,location)')
    .eq('id', params.id)
    .single();
  if (error) {
    log.warn('books.id.not_found', { detail: error.message });
    return jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404, { requestId: log.requestId });
  }
  return NextResponse.json({ data });
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
  const copy = [
    'title',
    'author',
    'publisher',
    'isbn',
    'year',
    'category_id',
    'rack_id',
    'cover_url',
    'pdf_url',
    'description',
    'pages',
    'language',
    'stock_total',
    'stock_available',
    'featured',
    'is_active',
  ] as const;
  for (const k of copy) if (body[k] !== undefined) payload[k] = body[k];
  if (body.judul !== undefined && payload.title === undefined) payload.title = body.judul;
  if (body.penulis !== undefined && payload.author === undefined) payload.author = body.penulis;
  if (typeof body.slug === 'string' && body.slug.trim()) payload.slug = slugify(body.slug);
  else if (typeof payload.title === 'string' && payload.title.trim())
    payload.slug = slugify(payload.title);

  const err = validateBook(payload, true);
  if (err) return jsonError('VALIDATION', err, 422);

  if (
    payload.category_id !== undefined &&
    payload.category_id !== null &&
    !isUuid(payload.category_id)
  ) {
    return jsonError('VALIDATION', 'category_id harus UUID valid.', 422);
  }
  if (payload.rack_id !== undefined && payload.rack_id !== null && !isUuid(payload.rack_id)) {
    return jsonError('VALIDATION', 'rack_id harus UUID valid.', 422);
  }
  if (
    payload.stock_available !== undefined &&
    (!Number.isInteger(payload.stock_available) || (payload.stock_available as number) < 0)
  ) {
    return jsonError('VALIDATION', 'stock_available tidak boleh negatif.', 422);
  }

  // Guard silang stock_available <= stock_total
  if (payload.stock_total !== undefined || payload.stock_available !== undefined) {
    const { data: cur } = await supabase
      .from('books')
      .select('stock_total,stock_available')
      .eq('id', params.id)
      .single();
    if (!cur) return jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404);
    const c = cur as { stock_total: number; stock_available: number };
    const nextTotal = (payload.stock_total as number) ?? c.stock_total;
    const nextAvail = (payload.stock_available as number) ?? c.stock_available;
    if (nextAvail < 0) return jsonError('VALIDATION', 'stock_available tidak boleh negatif.', 422);
    if (nextAvail > nextTotal)
      return jsonError('VALIDATION', 'stock_available tidak boleh melebihi stock_total.', 422);
  }

  const { data, error } = await supabase
    .from('books')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    log.error('books.id.save_failed', {
      detail: (error as { message?: unknown })?.message ?? String(error),
    });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate buku.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'books.update', params.id, payload);
  revalidateTag('books');
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  // Guard: tolak bila ada loan aktif (borrowed/overdue) — kolom migrasi.
  const { count } = await supabase
    .from('loans')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', params.id)
    .in('status', ['borrowed', 'overdue']);
  if ((count ?? 0) > 0)
    return jsonError('CONFLICT', 'Buku masih dipinjam, tidak bisa dihapus.', 409);

  const { error } = await supabase.from('books').delete().eq('id', params.id);
  if (error)
    return jsonError('DELETE_FAILED', 'Gagal menghapus buku.', 500, { requestId: log.requestId });
  await writeLog(supabase, user?.id, 'books.delete', params.id);
  revalidateTag('books');
  return NextResponse.json({ message: 'Buku dihapus.' });
}
