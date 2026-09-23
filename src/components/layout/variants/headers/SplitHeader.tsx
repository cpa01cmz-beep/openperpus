import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * SplitHeader — brand + CTA top row, full-width nav strip below.
 * Structural variant for brutalist-bar. Same LINKS, same var tokens.
 */
export default function SplitHeader({
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
      <div className="mx-auto flex h-16 w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
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
        <div className="flex items-center gap-2">
          <Link
            href="/katalog"
            className="rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cari Buku
          </Link>
          <MenuButton
            menuId="menu-split"
            toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/10 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
          />
        </div>
      </div>

      {/* desktop: split nav strip */}
      <nav aria-label="Main navigation" className="hidden border-t border-[var(--ink)]/10 lg:block">
        <ul className="mx-auto flex w-full max-w-[var(--container)] items-center justify-between px-4 sm:px-6 lg:px-8">
          {LINKS.map((l) => (
            <li key={l.href} className="flex-1">
              <NavLink
                href={l.href}
                label={l.label}
                className="block rounded-[var(--radius-md)] px-3 py-2.5 text-center text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
        </ul>
      </nav>

      <div
        id="menu-split"
        className="hidden border-t border-[var(--ink)]/10 bg-[var(--surface)] lg:hidden"
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
        </ul>
      </div>
    </header>
  );
}
