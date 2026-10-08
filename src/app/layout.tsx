import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import {
  Archivo,
  Archivo_Black,
  Barlow,
  Bitter,
  Bodoni_Moda,
  Courier_Prime,
  Karla,
  Libre_Caslon_Display,
  Libre_Franklin,
  Literata,
  Public_Sans,
} from 'next/font/google';
import './globals.css';
import { getSiteUrl } from '@/lib/site';
import { getLibrarySettings } from '@/lib/settings';
import { getTheme } from '@/lib/themes';

/* Kontras pasangan token dijaga oleh scripts/check-contrast.mjs (self-check),
 * bukan catatan manual: tiap pasang teks/latar 5 tema diukur di situ. */

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

const libreCaslon = Libre_Caslon_Display({
  subsets: ['latin'],
  variable: '--font-libre-caslon',
  weight: '400',
  display: 'swap',
});

const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  variable: '--font-libre-franklin',
  display: 'swap',
});

const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-bodoni',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-literata',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  variable: '--font-archivo-black',
  weight: '400',
  display: 'swap',
});

const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const bitter = Bitter({
  subsets: ['latin'],
  variable: '--font-bitter',
  display: 'swap',
});

const karla = Karla({
  subsets: ['latin'],
  variable: '--font-karla',
  display: 'swap',
});

/** Courier Prime selalu ikut: baris entri kartu katalog bertik di kelima tema. */
const courier = Courier_Prime({
  subsets: ['latin'],
  variable: '--font-courier',
  weight: ['400', '700'],
  display: 'swap',
});

/**
 * T-FONT-SPLIT (S4 perf): attach only the 3 font families the active theme
 * needs (kop, body, data) instead of all 11 vars. This gates which
 * `.variable` classes reach `<html>` per render.
 * Map: emerald Caslon+Franklin, midnight Bodoni+Archivo, paper
 * Literata+PublicSans, brutalist ArchivoBlack+Barlow, ocean Bitter+Karla,
 * semuanya + Courier Prime untuk `.entri`.
 */
export function fontVariablesForTheme(themeId: string): string {
  const data = ` ${courier.variable}`;
  switch (themeId) {
    case 'emerald':
      return `${libreCaslon.variable} ${libreFranklin.variable}${data}`;
    case 'midnight':
      return `${bodoni.variable} ${archivo.variable}${data}`;
    case 'paper':
      return `${literata.variable} ${publicSans.variable}${data}`;
    case 'brutalist':
      return `${archivoBlack.variable} ${barlow.variable}${data}`;
    case 'ocean':
      return `${bitter.variable} ${karla.variable}${data}`;
    default:
      return `${libreCaslon.variable} ${libreFranklin.variable}${data}`;
  }
}

export const OG_DEFAULT_IMAGE = '/og-default.jpg';

// Nonce-CSP (issue #24) butuh nonce per-request di HTML; ISR/prerender memakai
// HTML cache yang tidak bisa membawa nonce segar, jadi seluruh route di-SSR.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'Perpustakaan',
    template: '%s | Perpustakaan',
  },
  description: 'CMS Perpustakaan — katalog, peminjaman, dan konten.',
  alternates: {
    canonical: getSiteUrl(),
  },
  openGraph: {
    title: 'Perpustakaan',
    description: 'CMS Perpustakaan — katalog, peminjaman, dan konten.',
    type: 'website',
    locale: 'id_ID',
    url: getSiteUrl(),
    siteName: 'Perpustakaan',
    images: [{ url: OG_DEFAULT_IMAGE, width: 1200, height: 630, alt: 'Perpustakaan' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Perpustakaan',
    description: 'CMS Perpustakaan — katalog, peminjaman, dan konten.',
    images: [OG_DEFAULT_IMAGE],
  },
};

export async function generateViewport(): Promise<Viewport> {
  const settings = await getLibrarySettings();
  const theme = getTheme(settings.active_theme ?? 'emerald');
  return { themeColor: theme.tokens.brand, width: 'device-width', initialScale: 1 };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getLibrarySettings();
  const theme = getTheme(settings.active_theme ?? 'emerald');
  const t = theme.tokens;
  const themeStyle = {
    '--brand': t.brand,
    '--brand-soft': t['brand-soft'],
    '--brand-strong': t['brand-strong'],
    '--accent': t.accent,
    '--accent-soft': t['accent-soft'],
    '--surface': t.surface,
    '--ink': t.ink,
    '--heading': t.heading,
    '--font-heading': theme.fonts.heading,
    '--font-body': theme.fonts.body,
    '--radius-sm': theme.radius.sm,
    '--radius-md': theme.radius.md,
    '--radius-lg': theme.radius.lg,
    '--shadow-sm': theme.shadow.sm,
    '--shadow-md': theme.shadow.md,
    '--shadow-lg': theme.shadow.lg,
    '--container': theme.spacing.container,
    '--spacing-section': theme.spacing.section,
    '--spacing-card': theme.spacing.card,
  } as CSSProperties;
  const remote = supabaseOrigin();
  return (
    <html
      lang="id"
      data-theme={theme.id}
      style={themeStyle}
      className={fontVariablesForTheme(theme.id)}
    >
      <head>
        {remote ? (
          <>
            <link rel="preconnect" href={remote} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={remote} />
          </>
        ) : null}
      </head>
      <body className="min-h-dvh bg-[var(--surface)] font-sans text-[var(--ink)] antialiased">
        {/* CSS variables --brand dkk. diisi dari tabel `settings` oleh worker lain.
            Default aman di globals.css agar first paint tetap rapi. */}
        <a
          href="#main-content"
          className="skip-link sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to main content
        </a>
        <header role="banner" />
        <main id="main-content" className="w-full px-4 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer role="contentinfo" />
      </body>
    </html>
  );
}
