import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import {
  Archivo_Black,
  Cormorant_Garamond,
  Fraunces,
  Inter,
  Playfair_Display,
  Source_Sans_3,
  Source_Serif_4,
  Space_Grotesk,
} from 'next/font/google';
import './globals.css';
import { getSiteUrl } from '@/lib/site';
import { getLibrarySettings } from '@/lib/settings';
import { getTheme } from '@/lib/themes';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const archivo = Archivo_Black({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: '400',
});

const space = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
});

/**
 * T-FONT-SPLIT (S4 perf): attach only the 2 font families the active theme
 * needs instead of all 8 vars. All 8 next/font/google declarations above stay
 * available; this gates which `.variable` classes reach `<html>` per render.
 * Map: emerald Playfair+Inter, midnight Cormorant+Inter, paper
 * SourceSerif+SourceSans, brutalist Archivo+Space, ocean Fraunces+Inter.
 */
export function fontVariablesForTheme(themeId: string): string {
  switch (themeId) {
    case 'emerald':
      return `${inter.variable} ${playfair.variable}`;
    case 'midnight':
      return `${inter.variable} ${cormorant.variable}`;
    case 'paper':
      return `${sourceSerif.variable} ${sourceSans.variable}`;
    case 'brutalist':
      return `${archivo.variable} ${space.variable}`;
    case 'ocean':
      return `${fraunces.variable} ${inter.variable}`;
    default:
      return `${inter.variable} ${playfair.variable}`;
  }
}

export const OG_DEFAULT_IMAGE = '/og-default.jpg';

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
  return (
    <html lang="id"
      data-theme={theme.id}
      style={themeStyle}
      className={fontVariablesForTheme(theme.id)}
    >
      <body className="min-h-dvh bg-[var(--surface)] font-sans text-[var(--ink)] antialiased">
        {/* CSS variables --brand dkk. diisi dari tabel `settings` oleh worker lain.
            Default aman di globals.css agar first paint tetap rapi. */}
        <div className="w-full px-4 sm:px-6 lg:px-8">{children}</div>
      </body>
    </html>
  );
}
