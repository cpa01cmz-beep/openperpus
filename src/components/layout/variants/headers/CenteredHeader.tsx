import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * CenteredHeader — brand stacked + centered, nav centered below.
 * Structural variant: two-row centered masthead. Same LINKS, same var tokens.
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
    <header className="sticky top-0 z-40 border-b border-brand-strong/10 bg-[var(--surface)]/90 backdrop-blur">
      <div className="mx-auto w-full max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <span className="hidden text-xs font-medium uppercase tracking-widest text-[var(--ink)]/70 md:block">
            Katalog
          </span>
          <Link
            href="/"
            className="mx-auto flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:mx-0"
          >
            <LogoMark siteName={name} logoSrc={logoSrc} />
            <span className="leading-tight">
              <span className="block font-heading text-lg font-bold text-heading">{name}</span>
              {tag ? <span className="block text-[11px] text-[var(--ink)]/70">{tag}</span> : null}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/katalog"
              className="hidden rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:block"
            >
              Cari Buku
            </Link>
            <MenuButton
              menuId="menu-centered-mobile"
              toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/10 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
            />
          </div>
        </div>
        {/* desktop: centered nav row */}
        <nav
          aria-label="Main navigation"
          className="hidden justify-center border-t border-[var(--ink)]/10 md:flex"
        >
          <ul className="flex items-center gap-1 py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <NavLink
                  href={l.href}
                  label={l.label}
                  className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  activeClassName="bg-brand-soft text-brand"
                />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div
        id="menu-centered-mobile"
        className="hidden border-t border-[var(--ink)]/10 bg-[var(--surface)] md:hidden"
      >
        <ul className="mx-auto w-full max-w-[var(--container)] space-y-1 px-4 py-3 sm:px-6">
          {LINKS.map((l) => (
            <li key={l.href}>
              <NavLink
                href={l.href}
                label={l.label}
                className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
          <li className="pt-1">
            <Link
              href="/katalog"
              className="block rounded-[var(--radius-md)] bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white shadow"
            >
              Cari Buku
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
