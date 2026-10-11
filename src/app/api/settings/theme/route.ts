import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { normalizeRole } from '@/lib/auth';
import { THEMES } from '@/lib/themes';
import {
  LOCKED_THEME_MESSAGE,
  MAX_OVERRIDES_CHARS,
  THEME_IDS,
  ThemeOverridesLayoutSchema,
} from '@/lib/theme-overrides';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * PUT /api/settings/theme — admin-only, layout-only (Fase 1: tema dikunci).
 * Body strict: { active_theme?, theme_overrides?, reset? }.
 * - librarian -> 403 THEME_FORBIDDEN.
 * - tokens/fonts/radius/shadow/spacing -> 422 + pesan kunci-tema.
 */

const BODY_KEYS = ['active_theme', 'theme_overrides', 'reset'] as const;

export async function PUT(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user, profile } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
    profile: { role: string };
  };
  if (normalizeRole(profile?.role) !== 'admin') {
    return jsonError('THEME_FORBIDDEN', 'Hanya admin yang dapat mengubah tema.', 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('VALIDATION', 'Body harus object.', 422);
  }
  const raw = body as Record<string, unknown>;
  for (const k of Object.keys(raw)) {
    if (!(BODY_KEYS as readonly string[]).includes(k)) {
      return jsonError('VALIDATION', `Kunci tak dikenal: "${k}".`, 422);
    }
  }

  const payload: Record<string, unknown> = {};

  if (raw.active_theme !== undefined) {
    const theme = raw.active_theme;
    if (typeof theme !== 'string' || !(theme in THEMES)) {
      return jsonError('VALIDATION', `Tema tidak dikenal. Pilih: ${THEME_IDS.join(', ')}.`, 422);
    }
    payload.active_theme = theme;
  }

  if (raw.reset !== undefined && typeof raw.reset !== 'boolean') {
    return jsonError('VALIDATION', 'reset harus boolean.', 422);
  }

  if (raw.theme_overrides !== undefined) {
    const v = raw.theme_overrides;
    if (v !== null) {
      let serialized: string;
      try {
        serialized = JSON.stringify(v) ?? '';
      } catch {
        return jsonError('VALIDATION', 'theme_overrides tidak dapat diserialisasi.', 422);
      }
      if (serialized.length > MAX_OVERRIDES_CHARS) {
        return jsonError(
          'VALIDATION',
          `theme_overrides melebihi ${MAX_OVERRIDES_CHARS} karakter.`,
          422
        );
      }
      const parsed = ThemeOverridesLayoutSchema.safeParse(v);
      if (!parsed.success) {
        const message = parsed.error.includes('dikunci')
          ? parsed.error
          : `${parsed.error} ${LOCKED_THEME_MESSAGE}`;
        return jsonError('VALIDATION', message, 422);
      }
      payload.theme_overrides = parsed.data;
    } else {
      payload.theme_overrides = null;
    }
  } else if (raw.reset === true) {
    payload.theme_overrides = null;
  }

  if (Object.keys(payload).length === 0) {
    return jsonError(
      'VALIDATION',
      'Tidak ada perubahan. Kirim active_theme/theme_overrides/reset.',
      422
    );
  }

  const { data, error } = await supabase
    .from('library_settings')
    .update(payload)
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    log.error('settings.theme.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal menyimpan tema.', 500, {
      requestId: log.requestId,
    });
  }
  try {
    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      action: 'settings.theme.update',
      entity_type: 'settings',
      entity_id: '1',
      metadata: { keys: Object.keys(payload) },
    });
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
  // Purge settings cache + homepage so the new theme renders immediately.
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
