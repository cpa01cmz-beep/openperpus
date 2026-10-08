import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { CATALOG_CTA, LINKS, LogoMark, PANEL_LIST, PANEL_ROW, TAB_LACI } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * ClassicHeader — emerald default. Pelat label laci + tab pembatas di rail
 * depan, aksi "Cari Buku" sebagai stempel tercetak. Desktop & mobile (hamburger).
 * 1:1 preserve of the original Navbar markup/behavior.
 */
export default function ClassicHeader({
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
        className="mx-auto flex min-h-16 w-full max-w-[var(--container)] items-stretch gap-3 px-4 sm:px-6 lg:px-8"
      >
        {/* blok merek wajib bisa menyusut (min-w-0, tanpa shrink-0) */}
        <Link
          href="/"
          className="flex items-center min-w-0 md:shrink-0 gap-2.5 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="pelat-plat hidden 2xl:inline-flex">Katalog</span>
          <LogoMark siteName={name} logoSrc={logoSrc} />
          <span className="min-w-0 leading-tight">
            <span className="block line-clamp-2 font-heading text-base font-bold text-heading sm:text-lg">
              {name}
            </span>
            {tag ? (
              <span className="hidden sm:block truncate text-xs text-[var(--ink)]/70">{tag}</span>
            ) : null}
          </span>
        </Link>

        {/* desktop: tab guide-card duduk tepat di garis rail */}
        <ul className="ml-auto hidden max-w-full flex-wrap items-stretch gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href} className="flex shrink-0">
              <NavLink href={l.href} label={l.label} className={`${TAB_LACI} shrink-0`} />
            </li>
          ))}
        </ul>

        {/* aksi desktop sudah diduplikasi di panel mobile — sembunyikan di bawah md */}
        <span className="my-auto hidden md:flex items-center">
          <Link
            href="/katalog"
            className={`${CATALOG_CTA} rounded-[var(--radius-md)] bg-brand-strong hover:bg-brand`}
          >
            Cari Buku
          </Link>
        </span>

        <MenuButton
          menuId="menu-mobile"
          toggleClassName="my-auto grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/10 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      {/* mobile panel */}
      <div id="menu-mobile" className="hidden bg-[var(--surface)] md:hidden">
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
