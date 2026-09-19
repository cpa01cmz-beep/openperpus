import { unstable_cache } from 'next/cache';
import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import {
  FALLBACK_SETTINGS,
  normalizeOperationalHours,
  type LibrarySettings,
  type OperationalHour,
} from '@/lib/types';

export const SETTINGS_TAG = 'settings';
export const SETTINGS_REVALIDATE = 3600;

export async function fetchSettings(): Promise<LibrarySettings> {
  return cachedFetch(() => fetchSettingsUncached(), ['library-settings'], SETTINGS_TAG);
}

async function fetchSettingsUncached(): Promise<LibrarySettings> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('library_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return FALLBACK_SETTINGS;
    const row = data as LibrarySettings;
    return {
      ...FALLBACK_SETTINGS,
      ...row,
      operational_hours: normalizeOperationalHours(
        (row as { operational_hours?: unknown }).operational_hours
      ),
    };
  } catch {
    return FALLBACK_SETTINGS;
  }
}

/** Identitas perpus (single-row id=1), di-cache 1 jam, tag 'settings'. */
export const getLibrarySettings = unstable_cache(
  async (): Promise<LibrarySettings> => fetchSettings(),
  ['library-settings'],
  { tags: [SETTINGS_TAG], revalidate: SETTINGS_REVALIDATE }
);

/** Jam operasional sebagai array kanonis aman (koersi + fallback [] bila null). */
export function getOperationalHours(settings: LibrarySettings): OperationalHour[] {
  return normalizeOperationalHours(settings.operational_hours);
}

/** Sosmed sebagai object aman (fallback {} bila null). */
export function getSocials(settings: LibrarySettings): Record<string, string> {
  return settings.socials && typeof settings.socials === 'object' ? settings.socials : {};
}

export function formatOperationalHour(h: OperationalHour): string {
  const hari = h.day ?? '-';
  const buka = h.open ?? '';
  const tutup = h.close ?? '';
  return buka || tutup ? `${hari}: ${buka}–${tutup}` : hari;
}
