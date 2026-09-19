import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/settings  -> publik (RLS: anon boleh SELECT), library_settings id=1
 * PUT /api/settings  -> admin/librarian (RLS staff write)
 * Kolom mengikuti supabase/migrations/0001_core.sql + seed.sql.
 * Menerima juga alias Indonesia (docs/db-design) dan memetakannya.
 */

const ALLOWED: Record<string, string> = {
  // canonical migration columns
  name: 'name',
  tagline: 'tagline',
  logo_url: 'logo_url',
  favicon_url: 'favicon_url',
  address: 'address',
  phone: 'phone',
  email: 'email',
  operational_hours: 'operational_hours',
  socials: 'socials',
  welcome_text: 'welcome_text',
  vision: 'vision',
  mission: 'mission',
  about: 'about',
  seo_title: 'seo_title',
  seo_desc: 'seo_desc',
  announcement: 'announcement',
  active_theme: 'active_theme',
  // alias Indonesia (docs) -> canonical
  nama: 'name',
  nama_perpus: 'name',
  alamat: 'address',
  telepon: 'phone',
  jam_operasional: 'operational_hours',
  sosmed: 'socials',
  sosial_media: 'socials',
  sambutan: 'welcome_text',
  visi: 'vision',
  misi: 'mission',
  seo_description: 'seo_desc',
  pengumuman: 'announcement',
};

function normalizeSettings(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const mapped = ALLOWED[k];
    if (!mapped) continue; // abaikan kolom tak dikenal (mis. denda_per_hari yg tak ada di migrasi)
    out[mapped] = v === '' ? null : v;
  }
  return out;
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  // Publik: pakai anon client langsung (RLS mengizinkan SELECT settings).
  const supabase = createClient();
  const { data, error } = await supabase
    .from('library_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    log.error('settings.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil pengaturan.', 500, {
      requestId: log.requestId,
    });
  }
  if (!data) return jsonError('NOT_FOUND', 'Pengaturan belum di-seed.', 404);
  return NextResponse.json({ data });
}

export async function PUT(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('VALIDATION', 'Body harus object.', 422);
  }

  const payload = normalizeSettings(body as Record<string, unknown>);
  if (typeof payload.name === 'string' && payload.name.trim().length < 3) {
    return jsonError('VALIDATION', 'Nama perpustakaan minimal 3 karakter.', 422);
  }
  if (payload.email !== undefined && payload.email !== null && payload.email !== '') {
    const em = String(payload.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return jsonError('VALIDATION', 'Format email tidak valid.', 422);
    }
  }
  if (
    payload.active_theme !== undefined &&
    payload.active_theme !== null &&
    payload.active_theme !== ''
  ) {
    const theme = String(payload.active_theme);
    if (!['emerald', 'midnight', 'paper', 'brutalist', 'ocean'].includes(theme)) {
      return jsonError(
        'VALIDATION',
        'Tema tidak dikenal. Pilih emerald, midnight, paper, brutalist, atau ocean.',
        422
      );
    }
  }

  const { data, error } = await supabase
    .from('library_settings')
    .update(payload)
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    log.error('settings.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menyimpan pengaturan.', 500, {
      requestId: log.requestId,
    });
  }
  try {
    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      action: 'settings.update',
      entity_type: 'settings',
      entity_id: '1',
      metadata: { keys: Object.keys(payload) },
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
  // Purge settings cache + homepage so the new active_theme renders immediately.
  try {
    revalidateTag('settings');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/');
  } catch {
    /* abaikan */
  }
  return NextResponse.json({ data });
}
