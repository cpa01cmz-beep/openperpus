import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * ClassicHeader — emerald default. Logo left, nav right, CTA, mobile panel.
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
    <header className="sticky top-0 z-40 border-b border-brand-strong/10 bg-[var(--surface)]/90 backdrop-blur">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LogoMark siteName={name} logoSrc={logoSrc} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-heading text-base font-bold text-heading sm:text-lg">
              {name}
            </span>
            {tag ? (
              <span className="block truncate text-[11px] text-[var(--ink)]/70">{tag}</span>
            ) : null}
          </span>
        </Link>

        {/* desktop */}
        <ul className="hidden items-center gap-1 md:flex">
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
          <li className="ml-2">
            <Link
              href="/katalog"
              className="rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Cari Buku
            </Link>
          </li>
        </ul>

        {/* mobile toggle */}
        <MenuButton
          menuId="menu-mobile"
          toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/10 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      {/* mobile panel */}
      <div
        id="menu-mobile"
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
