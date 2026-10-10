import type { MetadataRoute } from 'next';
import { fetchSettings, getSiteName } from '@/lib/settings';
import { getEffectiveThemeFromSettings } from '@/lib/theme-overrides';

/** PWA manifest dinamis — nama/deskripsi/warna dari library_settings + active_theme. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await fetchSettings().catch(() => null);
  const name = settings ? getSiteName(settings) : 'Perpustakaan';
  const description =
    settings?.seo_desc?.trim() ||
    settings?.tagline?.trim() ||
    'Katalog, berita, dan layanan perpustakaan.';
  const themeColor = getEffectiveThemeFromSettings({
    active_theme: settings?.active_theme ?? 'emerald',
    theme_overrides: (settings as { theme_overrides?: unknown } | null)?.theme_overrides ?? null,
  }).tokens.brand;
  const favicon = settings?.favicon_url?.trim() || '/favicon.ico';
  return {
    name,
    short_name: name.slice(0, 12) || 'Perpus',
    description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    lang: 'id',
    icons: [
      {
        src: favicon,
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
