import { createElement } from 'react';
import { DEFAULT_THEME } from '@/lib/themes';
import { getEffectiveTheme } from '@/lib/theme-overrides';
import { resolveFooterVariant } from '@/components/layout/variants/registry';
import type { LibrarySettings, NavItem } from '@/lib/types';

/** Thin switcher (server): resolves theme → footerVariant → registry component. No if-hell. */
export default function Footer({
  settings,
  themeId,
  menus,
}: {
  settings: LibrarySettings;
  /** Active theme id passed down from the public layout; falls back to settings.active_theme. */
  themeId?: string | null;
  /** Menu CMS dari tabel menus (fetchFooterMenus). Fallback ke FOOTER_LINKS di varian. */
  menus?: NavItem[];
}) {
  const theme = getEffectiveTheme(
    themeId ?? settings.active_theme ?? DEFAULT_THEME,
    (settings as { theme_overrides?: unknown })?.theme_overrides ?? null
  );
  // createElement (bukan JSX <Foot/>) agar lolos react-hooks/static-components;
  // registry selalu mengembalikan komponen stabil, bukan dibuat saat render.
  const Foot = resolveFooterVariant(theme.layout.footerVariant);
  return createElement(Foot, { settings, menus });
}
