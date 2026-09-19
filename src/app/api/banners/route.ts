import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, parsePaging } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/banners — urut sort_order (staf; publik via helper lib)
 * POST /api/banners { title|judul, subtitle|subjudul, image_url|gambar_url, link|link_url, sort_order|urutan, is_active }
 * PUT /api/banners?id= | DELETE /api/banners?id= (admin untuk hapus; tulis staf)
 * Kolom migrasi: title, subtitle, image_url, link, sort_order, is_active.
 */
function revalidateBanners(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('banners');
    done.push('banners');
  } catch {}
  try {
    revalidatePath('/');
    done.push('/');
  } catch {}
  return done;
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
      entity_type: 'banners',
      entity_id: entityId,
      metadata,
    });
  } catch {}
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { sp, page, perPage, from, to } = parsePaging(req.url, 10);

  const SORTABLE = ['title', 'sort_order', 'created_at'] as const;
  const sortParam = (sp.get('sort') ?? '').trim();
  const sort: (typeof SORTABLE)[number] = (SORTABLE as readonly string[]).includes(sortParam)
    ? (sortParam as (typeof SORTABLE)[number])
    : 'sort_order';
  const orderParam = (sp.get('order') ?? '').trim().toLowerCase();
  const asc =
    orderParam === 'asc'
      ? true
      : orderParam === 'desc'
        ? false
        : sort === 'sort_order' || sort === 'title';

  const { data, error, count } = await supabase
    .from('banners')
    .select('id,title,image_url,link,sort_order,is_active,created_at', { count: 'exact' })
    .order(sort, { ascending: asc })
    .range(from, to);
  if (error) {
    log.error('banners.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil banner.', 500, { requestId: log.requestId });
  }
  const total = count ?? 0;
  return NextResponse.json({
    data,
    meta: { page, per_page: perPage, total },
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  });
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

  const title = (((body.title ?? body.judul) as string) ?? '').trim();
  const image_url = (((body.image_url ?? body.gambar_url) as string) ?? '').trim();
  if (!title) return jsonError('VALIDATION', 'title/judul wajib diisi.', 422);
  if (!image_url) return jsonError('VALIDATION', 'image_url/gambar_url wajib diisi.', 422);

  const { data, error } = await supabase
    .from('banners')
    .insert({
      title,
      subtitle: ((body.subtitle ?? body.subjudul) as string | null) ?? null,
      image_url,
      link: ((body.link ?? body.link_url) as string | null) ?? null,
      sort_order:
        body.sort_order !== undefined
          ? Number(body.sort_order)
          : body.urutan !== undefined
            ? Number(body.urutan)
            : 0,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    log.error('banners.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah banner.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'banners.create', (data as { id: string }).id, { title });
  return NextResponse.json({ data, revalidated: revalidateBanners() }, { status: 201 });
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
  if (body.title !== undefined || body.judul !== undefined)
    payload.title = ((body.title ?? body.judul) as string).trim();
  if (body.subtitle !== undefined || body.subjudul !== undefined)
    payload.subtitle = (body.subtitle ?? body.subjudul) as string | null;
  if (body.image_url !== undefined || body.gambar_url !== undefined)
    payload.image_url = (body.image_url ?? body.gambar_url) as string;
  if (body.link !== undefined || body.link_url !== undefined)
    payload.link = (body.link ?? body.link_url) as string | null;
  if (body.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
  if (body.urutan !== undefined && payload.sort_order === undefined)
    payload.sort_order = Number(body.urutan);
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const { data, error } = await supabase
    .from('banners')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    log.error('banners.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate banner.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'banners.update', id, payload);
  return NextResponse.json({ data, revalidated: revalidateBanners() });
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

  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) {
    log.error('banners.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus banner.', 500, { requestId: log.requestId });
  }
  await writeLog(supabase, user?.id, 'banners.delete', id);
  return NextResponse.json({ message: 'Banner dihapus.', revalidated: revalidateBanners() });
}
