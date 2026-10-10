import { getTheme } from '@/lib/themes';
import { resolveHeaderVariant } from '@/components/layout/variants/registry';
import type { LibrarySettings, NavItem } from '@/lib/types';

type Props = {
  siteName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  /** Active theme id passed down from the public layout (server). */
  themeId?: string | null;
  /** Full settings passthrough so variants needing contact info stay server-fed. */
  settings?: LibrarySettings;
  /** Menu CMS dari tabel menus (fetchHeaderMenus). Fallback ke LINKS di varian. */
  menus?: NavItem[];
};

/** Thin switcher: resolves theme → headerVariant → registry component. No if-hell. */
export default function Navbar({ siteName, tagline, logoUrl, themeId, settings, menus }: Props) {
  const theme = getTheme(themeId ?? settings?.active_theme ?? 'emerald');
  const Header = resolveHeaderVariant(theme.layout.headerVariant);
  return (
    <Header
      siteName={siteName}
      tagline={tagline}
      logoUrl={logoUrl}
      logo_url={settings?.logo_url ?? null}
      settings={settings}
      menus={menus}
    />
  );
}
