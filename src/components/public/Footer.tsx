import { getTheme } from '@/lib/themes';
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
  const theme = getTheme(themeId ?? settings.active_theme ?? 'emerald');
  const Foot = resolveFooterVariant(theme.layout.footerVariant);
  return <Foot settings={settings} menus={menus} />;
}
