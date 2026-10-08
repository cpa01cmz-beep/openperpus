import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { CATALOG_CTA, LINKS, LogoMark, PANEL_LIST, PANEL_ROW, TAB_LACI } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * CenteredHeader — pelat label kiri, masthead terpusat, strip tab di bawah
 * dipisah garis kembar kartu-kop. Structural variant: two-row centered masthead.
 */
export default function CenteredHeader({
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
      <div className="mx-auto w-full max-w-[var(--container)]">
        <div className="flex items-stretch gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="hidden min-w-0 flex-1 justify-start md:flex items-center">
            <span className="pelat-plat">Katalog</span>
          </div>
          {/* blok merek wajib bisa menyusut (min-w-0) + nama terpotong */}
          <Link
            href="/"
            className="mx-auto flex min-w-0 flex-col items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:mx-0"
          >
            <LogoMark siteName={name} logoSrc={logoSrc} />
            <span className="min-w-0 w-full leading-tight">
              <span className="block line-clamp-2 font-heading text-lg font-bold text-heading">
                {name}
              </span>
              {tag ? (
                <span className="hidden sm:block truncate text-xs text-[var(--ink)]/70">{tag}</span>
              ) : null}
            </span>
          </Link>
          <div className="flex flex-1 items-center justify-end gap-2">
            <span className="hidden md:flex items-center">
              <Link
                href="/katalog"
                className={`${CATALOG_CTA} rounded-[var(--radius-md)] bg-brand-strong hover:bg-brand`}
              >
                Cari Buku
              </Link>
            </span>
            <MenuButton
              menuId="menu-centered-mobile"
              toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/10 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
            />
          </div>
        </div>

        {/* desktop: strip tab terpusat, duduk di garis rail */}
        <nav
          aria-label="Main navigation"
          className="hidden items-stretch border-t border-rule md:flex"
        >
          <ul className="flex max-w-full flex-wrap items-stretch gap-1 px-4 sm:px-6 lg:px-8">
            {LINKS.map((l) => (
              <li key={l.href} className="flex shrink-0">
                <NavLink href={l.href} label={l.label} className={`${TAB_LACI} shrink-0`} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div id="menu-centered-mobile" className="hidden bg-[var(--surface)] md:hidden">
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
              Cari Buku
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
