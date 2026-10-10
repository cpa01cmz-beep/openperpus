import type { LibrarySettings, NavItem } from '@/lib/types';

/** Props every header variant must accept (registry contract). */
export type HeaderVariantProps = {
  siteName: string;
  tagline?: string | null;
  /** snake_case (settings column) — preferred. */
  logo_url?: string | null;
  /** camelCase alias kept for Navbar compat. */
  logoUrl?: string | null;
  settings?: LibrarySettings;
  /** Menu CMS (tabel menus). Bila kosong/undefined, pakai fallback LINKS. */
  menus?: NavItem[];
};

/** Props every footer variant must accept (registry contract). */
export type FooterVariantProps = {
  settings: LibrarySettings;
  siteName?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  /** Menu CMS (tabel menus). Bila kosong/undefined, pakai fallback FOOTER_LINKS. */
  menus?: NavItem[];
};

/** Resolve the effective logo src from either prop spelling. */
export function resolveLogoSrc(props: {
  logo_url?: string | null;
  logoUrl?: string | null;
}): string | null {
  return props.logo_url ?? props.logoUrl ?? null;
}
