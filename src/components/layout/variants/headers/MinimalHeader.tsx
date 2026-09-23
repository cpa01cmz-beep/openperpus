import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * MinimalHeader — slim single row, text links only, no CTA button.
 * Structural variant for paper-minimal / midnight-slim.
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
    <header className="sticky top-0 z-40 border-b border-brand-strong/10 bg-[var(--surface)]/90 backdrop-blur">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-12 w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LogoMark siteName={name} logoSrc={logoSrc} size="sm" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-heading text-sm font-bold text-[var(--ink)]">
              {name}
            </span>
            {tag ? (
              <span className="hidden truncate text-[11px] text-[var(--ink)] opacity-70 sm:block">
                {tag}
              </span>
            ) : null}
          </span>
        </Link>

        <ul className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <NavLink
                href={l.href}
                label={l.label}
                className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
        </ul>

        <MenuButton
          menuId="menu-minimal-mobile"
          toggleClassName="grid h-9 w-9 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      <div
        id="menu-minimal-mobile"
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
        </ul>
      </div>
    </header>
  );
}
