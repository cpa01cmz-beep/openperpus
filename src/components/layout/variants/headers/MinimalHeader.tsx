import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { CATALOG_CTA, LINKS, LogoMark, PANEL_LIST, PANEL_ROW, TAB_LACI } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * MinimalHeader — muka laci ramping: pelat kecil + baris tab saja, aksinya
 * menyatu di pelat. Structural variant for paper-minimal / midnight-slim.
 */
export default function MinimalHeader({
  siteName,
  tagline,
  settings,
  logo_url,
  logoUrl,
}: HeaderVariantProps) {
  const logoSrc = resolveLogoSrc({ logo_url, logoUrl }) ?? settings?.logo_url ?? null;
  const name = siteName || settings?.name || 'Perpustakaan Digital';
  const tag = tagline ?? settings?.tagline ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-[var(--surface)] text-[var(--ink)]">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-12 w-full max-w-[var(--container)] items-stretch gap-3 px-4 sm:px-6 lg:px-8"
      >
        {/* blok merek wajib bisa menyusut (min-w-0, tanpa shrink-0) */}
        <Link
          href="/"
          className="my-auto flex items-center min-w-0 md:shrink-0 gap-2 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LogoMark siteName={name} logoSrc={logoSrc} size="sm" />
          <span className="min-w-0 leading-tight">
            <span className="pelat-plat hidden max-w-[8.5rem] 2xl:inline-flex sm:max-w-[14rem]">
              <span className="min-w-0 line-clamp-2">{name}</span>
            </span>
            {tag ? (
              <span className="hidden sm:block truncate text-xs text-[var(--ink)] opacity-70">
                {tag}
              </span>
            ) : null}
          </span>
        </Link>

        <ul className="ml-auto hidden max-w-full flex-wrap items-stretch gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href} className="flex shrink-0">
              <NavLink href={l.href} label={l.label} className={`${TAB_LACI} shrink-0`} />
            </li>
          ))}
        </ul>

        <span className="my-auto hidden md:flex items-center">
          <Link
            href="/katalog"
            className={`${CATALOG_CTA} rounded-[var(--radius-md)] bg-brand-strong hover:bg-brand`}
          >
            Katalog
          </Link>
        </span>

        <MenuButton
          menuId="menu-minimal-mobile"
          toggleClassName="my-auto grid h-9 w-9 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      <div id="menu-minimal-mobile" className="hidden bg-[var(--surface)] md:hidden">
        <ul className={PANEL_LIST}>
          {LINKS.map((l) => (
            <li key={l.href} className={PANEL_ROW}>
              <NavLink
                href={l.href}
                label={l.label}
                className={`${TAB_LACI} w-full rounded-none`}
              />
            </li>
          ))}
          <li className={`${PANEL_ROW} py-2`}>
            <Link
              href="/katalog"
              className={`${CATALOG_CTA} w-full rounded-[var(--radius-md)] bg-brand-strong hover:bg-brand`}
            >
              Katalog
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
