import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { THEMES } from '@/lib/themes';
import { isAllowedLinkUrl, sanitizeContentPayload, validateContentFields } from '@/lib/validation';
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
  fine_per_day: 'fine_per_day',
  // plafon denda keterlambatan (issue #72) — 0 = tanpa plafon
  fine_max: 'fine_max',
  // kebijakan pinjam (issue #74) — kolom kanonis Inggris, lihat migrasi 0026
  loan_days: 'loan_days',
  max_extensions: 'max_extensions',
  replacement_fee_damaged: 'replacement_fee_damaged',
  replacement_fee_lost: 'replacement_fee_lost',
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
  denda_per_hari: 'fine_per_day',
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
  // Fase 1 (layout-only): tema dikunci di endpoint umum — cek DULU agar kontrak
  // HINT_USE_THEME_ENDPOINT utuh walau field lain ikut invalid.
  {
    const rawBody = body as Record<string, unknown>;
    if ('active_theme' in rawBody || 'theme_overrides' in rawBody) {
      return jsonError(
        'HINT_USE_THEME_ENDPOINT',
        'Pengaturan tema terkunci di endpoint ini — gunakan PUT /api/settings/theme.',
        422
      );
    }
  }
  // socials dirender sebagai href publik — tolak skema berbahaya (javascript:/data:/dst).
  if ('socials' in payload && payload.socials != null) {
    const soc = payload.socials;
    if (typeof soc !== 'object' || Array.isArray(soc)) {
      return jsonError('VALIDATION', 'socials harus object.', 422);
    }
    for (const [k, v] of Object.entries(soc as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v !== 'string' || !isAllowedLinkUrl(v)) {
        return jsonError(
          'VALIDATION',
          `socials.${k} harus URL http(s), mailto, tel, atau sms yang valid.`,
          422
        );
      }
    }
  }
  sanitizeContentPayload('settings', payload);
  const capErr = validateContentFields('settings', payload);
  if (capErr) return jsonError('VALIDATION', capErr, 422);
  // logo/favicon dirender sebagai src/href publik (Image, <link rel=icon>, manifest)
  // — tolak skema berbahaya (javascript:/data:/blob:/file:) dan protocol-relative.
  // Syarat sengaja longgar (boleh https host mana pun) mengikuti placeholder form
  // "https://…/logo.png"; jangan pakai isAllowedImageUrl (itu hanya *.supabase.co).
  for (const f of ['logo_url', 'favicon_url'] as const) {
    const v = payload[f];
    if (v != null && v !== '' && !isAllowedLinkUrl(v)) {
      return jsonError('VALIDATION', `${f} harus URL http(s), path relatif, atau kosong.`, 422);
    }
  }
  if (typeof payload.name === 'string' && payload.name.trim().length < 3) {
    return jsonError('VALIDATION', 'Nama perpustakaan minimal 3 karakter.', 422);
  }
  if (payload.email !== undefined && payload.email !== null && payload.email !== '') {
    const em = String(payload.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return jsonError('VALIDATION', 'Format email tidak valid.', 422);
    }
  }
  if ('fine_per_day' in payload) {
    const v = payload.fine_per_day;
    const rate = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v);
    if (v === null || !Number.isFinite(rate) || rate <= 0) {
      return jsonError('VALIDATION', 'Tarif denda per hari harus lebih dari 0.', 422);
    }
    payload.fine_per_day = rate;
  }
  // Plafon denda keterlambatan (#72): rupiah >= 0, 0 = tanpa plafon.
  if ('fine_max' in payload) {
    const v = payload.fine_max;
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v);
    if (v !== null && (!Number.isFinite(n) || n < 0)) {
      return jsonError(
        'VALIDATION',
        'Plafon denda harus angka rupiah >= 0 (0 = tanpa plafon).',
        422
      );
    }
    payload.fine_max = v === null ? 0 : n;
  }
  // Kebijakan pinjam (issue #74): integer/rupiah dengan rentang sama seperti
  // CHECK constraint di migrasi 0026 — nilai di luar rentang ditolak 422,
  // bukan dipotong senyap oleh DB.
  if ('loan_days' in payload) {
    const v = payload.loan_days;
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v);
    if (v === null || !Number.isInteger(n) || n < 1 || n > 365) {
      return jsonError('VALIDATION', 'Lama pinjam (hari) harus bilangan bulat 1..365.', 422);
    }
    payload.loan_days = n;
  }
  if ('max_extensions' in payload) {
    const v = payload.max_extensions;
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v);
    if (v === null || !Number.isInteger(n) || n < 0 || n > 10) {
      return jsonError(
        'VALIDATION',
        'Batas maksimum perpanjangan harus bilangan bulat 0..10.',
        422
      );
    }
    payload.max_extensions = n;
  }
  for (const f of ['replacement_fee_damaged', 'replacement_fee_lost'] as const) {
    if (!(f in payload)) continue;
    const v = payload[f];
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v);
    if (v !== null && (!Number.isFinite(n) || n < 0)) {
      return jsonError('VALIDATION', `${f} harus angka rupiah >= 0.`, 422);
    }
    payload[f] = v === null ? 0 : n;
  }
  if (
    payload.active_theme !== undefined &&
    payload.active_theme !== null &&
    payload.active_theme !== ''
  ) {
    const theme = String(payload.active_theme);
    if (!(theme in THEMES)) {
      const valid = Object.keys(THEMES).join(', ');
      return jsonError('VALIDATION', `Tema tidak dikenal. Pilih: ${valid}.`, 422);
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
    revalidateTag('settings', 'max');
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
