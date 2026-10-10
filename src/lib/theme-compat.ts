/**
 * src/lib/theme-compat.ts — kompatibilitas variant layout per famili tema.
 * Fase 1 (layout-only): tema dikunci, hanya layout boleh di-override.
 *
 * MURNI + server-safe: tanpa React, tanpa next/headers, tanpa dependensi baru.
 * Dipakai oleh src/lib/theme-overrides.ts (server) untuk menyaring override
 * sebelum diterapkan ke ThemeDef.
 */
import { getTheme } from './themes';

export type ThemeFamily = 'formal' | 'hard' | 'hand';

/** Famili tiap theme id (6 tema). Tak dikenal -> 'formal' (fail-open aman). */
export const THEME_FAMILIES: Record<string, ThemeFamily> = {
  emerald: 'formal',
  midnight: 'formal',
  paper: 'formal',
  ocean: 'formal',
  brutalist: 'hard',
  sketch: 'hand',
};

export type LayoutKind = 'header' | 'footer' | 'hero';

/* ------------------------------------------------------------------ */
/* Daftar variant valid — duplikasi string eksplisit (JANGAN import     */
/* registry React). Sumber:                                            */
/*   header/footer: src/components/layout/variants/registry.ts         */
/*     (HEADER_VARIANTS / FOOTER_VARIANTS)                              */
/*   hero: src/components/hero/HeroSwitch.tsx (variantComponents)      */
/* ------------------------------------------------------------------ */

export const HEADER_VARIANT_KEYS: readonly string[] = [
  'emerald-classic',
  'midnight-slim',
  'paper-minimal',
  'brutalist-bar',
  'ocean-wave',
  'sketch-notebook',
  'classic',
  'centered',
  'minimal',
  'top-bar',
  'topbar',
  'split',
];

export const FOOTER_VARIANT_KEYS: readonly string[] = [
  'emerald-standard',
  'midnight-extended',
  'paper-colophon',
  'brutalist-index',
  'ocean-harbor',
  'sketch-margin',
  'classic',
  'standard',
  'minimal',
  'colophon',
  'stacked',
  'extended',
  'index',
  'harbor',
];

export const HERO_VARIANT_KEYS: readonly string[] = [
  'emerald-centered',
  'midnight-showcase',
  'paper-editorial',
  'brutalist-manifesto',
  'ocean-tide',
  'sketch-doodle',
  'centered',
  'editorial',
  'stacked',
  'split',
  'classic',
  'sketch',
  'doodle',
];

/* ------------------------------------------------------------------ */
/* Matriks izin per famili.                                            */
/* - formal: semua variant KECUALI sketch-* (sketch-notebook untuk      */
/*   header, sketch-margin untuk footer, sketch-doodle/sketch/doodle    */
/*   untuk hero).                                                      */
/* - hard: hanya brutalist + alias struktural netral.                  */
/* - hand: hanya sketch-*.                                             */
/* ------------------------------------------------------------------ */

export const ALLOWED_LAYOUT: Record<
  ThemeFamily,
  { headers: readonly string[]; footers: readonly string[]; heroes: readonly string[] }
> = {
  formal: {
    headers: [
      'emerald-classic',
      'midnight-slim',
      'paper-minimal',
      'brutalist-bar',
      'ocean-wave',
      'classic',
      'centered',
      'minimal',
      'top-bar',
      'topbar',
      'split',
    ],
    footers: [
      'emerald-standard',
      'midnight-extended',
      'paper-colophon',
      'brutalist-index',
      'ocean-harbor',
      'classic',
      'standard',
      'minimal',
      'colophon',
      'stacked',
      'extended',
      'index',
      'harbor',
    ],
    heroes: [
      'emerald-centered',
      'midnight-showcase',
      'paper-editorial',
      'brutalist-manifesto',
      'ocean-tide',
      'centered',
      'editorial',
      'stacked',
      'split',
      'classic',
    ],
  },
  hard: {
    headers: ['brutalist-bar', 'split', 'classic', 'minimal'],
    footers: ['brutalist-index', 'stacked', 'index', 'classic', 'standard'],
    heroes: ['brutalist-manifesto', 'stacked', 'classic'],
  },
  hand: {
    headers: ['sketch-notebook'],
    footers: ['sketch-margin'],
    heroes: ['sketch-doodle', 'sketch', 'doodle'],
  },
};

/** Section homepage yang dikenal (subset dari theme.layout.homepageSections). */
export const SECTION_IDS = [
  'hero',
  'announcement',
  'stats',
  'welcome',
  'featured',
  'news',
  'testimonials',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Famili untuk sebuah base theme id (tak dikenal -> 'formal'). */
export function familyOf(baseId: string): ThemeFamily {
  return THEME_FAMILIES[baseId] ?? 'formal';
}

/**
 * Apakah variantKey boleh dipakai untuk kind pada theme baseId?
 * Kunci tak dikenal / bukan string -> false (fail-closed, pemanggil memakai fallback).
 */
export function isCompatible(baseId: string, kind: LayoutKind, variantKey: unknown): boolean {
  if (typeof variantKey !== 'string' || variantKey.length === 0) return false;
  const family = familyOf(baseId);
  const allowed = ALLOWED_LAYOUT[family];
  if (kind === 'header') return allowed.headers.includes(variantKey);
  if (kind === 'footer') return allowed.footers.includes(variantKey);
  return allowed.heroes.includes(variantKey);
}

/**
 * Variant aman untuk baseId + kind: variant bawaan theme dari THEMES
 * (via getTheme), dengan fallback final emerald bila kosong.
 */
export function fallbackVariant(baseId: string, kind: LayoutKind): string {
  const theme = getTheme(baseId);
  if (kind === 'header') return theme.layout.headerVariant || 'emerald-classic';
  if (kind === 'hero') return theme.layout.heroVariant || 'emerald-centered';
  return theme.layout.footerVariant || 'emerald-standard';
}
