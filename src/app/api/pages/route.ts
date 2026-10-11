import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify, parsePaging } from '@/lib/supabase/auth';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/pages?page=&per_page=&q= — publik (hanya is_active).
 *   Staf: ?all=1 untuk lihat semua (termasuk nonaktif).
 * POST /api/pages — pustakawan+ {title|judul, slug?, content_md|konten, excerpt|ringkasan?, seo_title?, seo_desc?, is_active|status?, show_in_menu?}
 * PUT /api/pages/{id} — pustakawan+ (satu transport ID, issue #54: ?id= dihapus)
 * DELETE /api/pages/{id} — admin
 * Kolom migrasi 0001 (+0004 show_in_menu): slug UNIQUE, title, content_md, excerpt,
 * seo_title, seo_desc, is_active, show_in_menu.
 * Slug reserved (RESERVED_SLUGS) ditolak 422 agar tak menabrak rute sistem.
 */

export const RESERVED_SLUGS = [
  'tentang',
  'layanan',
  'kontak',
  'faq',
  'berita',
  'katalog',
  'buku',
  'halaman',
  'denda',
  'reservasi-saya',
  'login',
  'daftar',
  'admin',
  'api',
] as const;

const STATIC_REVALIDATE_SLUGS = ['tentang', 'layanan', 'kontak', 'faq'] as const;

function parseActive(v: unknown, def = true): boolean {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'published', 'publish', 'active', 'aktif', 'ya', 'yes'].includes(s))
    return true;
  if (['false', '0', 'draft', 'archived', 'inactive', 'nonaktif', 'tidak', 'no'].includes(s))
    return false;
  return def;
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
      entity_type: 'pages',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

function revalidatePages(slug?: string | null): string[] {
  const done: string[] = [];
  try {
    revalidateTag('pages', 'max');
    done.push('pages');
  } catch {
    /* abaikan di runtime tanpa cache-tag */
  }
  try {
    revalidatePath('/');
    done.push('/');
  } catch {
    /* abaikan */
  }
  if (slug) {
    try {
      revalidatePath(`/halaman/${slug}`);
      done.push(`/halaman/${slug}`);
    } catch {
      /* abaikan */
    }
    if ((STATIC_REVALIDATE_SLUGS as readonly string[]).includes(slug)) {
      try {
        revalidatePath(`/${slug}`);
        done.push(`/${slug}`);
      } catch {
        /* abaikan */
      }
    }
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

  // ?id= — satu halaman (publik hanya yang aktif; nonaktif butuh staf).
  if (id) {
    const { data, error } = await supabase.from('pages').select('*').eq('id', id).single();
    if (error || !data) return jsonError('NOT_FOUND', 'Halaman tidak ditemukan.', 404);
    if ((data as { is_active: boolean }).is_active !== true && all !== '1') {
      const guard = await requireStaff();
      if ('errorResponse' in guard && guard.errorResponse)
        return jsonError('NOT_FOUND', 'Halaman tidak ditemukan.', 404);
    }
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': all === '1' ? 'no-store' : 'public, s-maxage=300' } }
    );
  }

  let query = supabase
    .from('pages')
    .select('*', { count: 'exact' })
    .order('title', { ascending: true })
    .range(from, to);

  if (all !== '1') query = query.eq('is_active', true);
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.or(`title.ilike.%${clean}%,slug.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('pages.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil halaman.', 500, { requestId: log.requestId });
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

  const title = String(body.title ?? body.judul ?? '').trim();
  if (!title) return jsonError('VALIDATION', 'title/judul wajib diisi.', 422);
  const content_md = String(
    body.content_md ?? body.konten ?? body.content ?? body.isi ?? ''
  ).trim();
  if (!content_md) return jsonError('VALIDATION', 'content_md/konten wajib diisi.', 422);

  const slug =
    typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(title);
  if (!slug) return jsonError('VALIDATION', 'slug tidak valid.', 422);
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return jsonError('VALIDATION', `Slug "${slug}" dipakai rute sistem, pilih slug lain.`, 422);
  }

  const showRaw = body.show_in_menu ?? body.tampil_di_menu;

  const { data, error } = await supabase
    .from('pages')
    .insert({
      title,
      slug,
      content_md,
      excerpt: ((body.excerpt ?? body.ringkasan) as string | null) ?? null,
      seo_title: (body.seo_title as string | null) ?? null,
      seo_desc: (body.seo_desc as string | null) ?? null,
      is_active: parseActive(body.is_active ?? body.status ?? body.aktif, true),
      show_in_menu: showRaw === undefined ? false : Boolean(showRaw),
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('pages.conflict', { detail: error.message });
      return jsonError('CONFLICT', 'Slug halaman sudah dipakai.', 409, {
        requestId: log.requestId,
      });
    }
    log.error('pages.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menambah halaman.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, user?.id, 'pages.create', (data as { id: string }).id, { title, slug });
  return NextResponse.json(
    { data, revalidated: revalidatePages((data as { slug: string }).slug) },
    { status: 201 }
  );
}
