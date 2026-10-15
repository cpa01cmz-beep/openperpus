import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import type { NavItem } from '@/lib/types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * BazaarHeader — Shopee-style commerce header for bazaar-commerce.
 * Sticky paper bar with 3px ink rule, ink brand badge, uppercase
 * Space Grotesk links, orange hard-shadow CTA. Same LINKS, same var tokens.
 */
export default function BazaarHeader({
  siteName,
  tagline,
  settings,
  logo_url,
  logoUrl,
  menus,
}: HeaderVariantProps) {
  const logoSrc = resolveLogoSrc({ logo_url, logoUrl }) ?? settings?.logo_url ?? null;
  const name = siteName || settings?.name || 'Perpustakaan Digital';
  const tag = tagline ?? settings?.tagline ?? null;

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-[var(--ink)] bg-[var(--surface)]">
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
            <span className="block truncate font-heading text-base font-bold uppercase tracking-tight text-heading sm:text-lg">
              {name}
            </span>
            {tag ? (
              <span className="block truncate text-xs font-semibold uppercase tracking-widest text-brand">
                {tag}
              </span>
            ) : null}
          </span>
        </Link>

        {/* desktop */}
        <ul className="hidden items-center gap-1 md:flex">
          {(menus && menus.length > 0 ? menus : LINKS).map((l) => (
            <li key={l.href}>
              <NavLink
                href={l.href}
                label={l.label}
                target={(l as NavItem).target}
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--ink)]/70 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
          <li className="ml-2">
            <Link
              href="/katalog"
              className="rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wide text-surface shadow-[var(--shadow-md)] transition hover:translate-y-[2px] hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cari Buku
            </Link>
          </li>
        </ul>

        {/* mobile toggle */}
        <MenuButton
          menuId="menu-bazaar-mobile"
          toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      {/* mobile panel */}
      <div
        id="menu-bazaar-mobile"
        className="hidden border-t-[3px] border-[var(--ink)] bg-[var(--surface)] md:hidden"
      >
        <ul className="mx-auto w-full max-w-[var(--container)] space-y-1 px-4 py-3 sm:px-6">
          {(menus && menus.length > 0 ? menus : LINKS).map((l) => (
            <li key={l.href}>
              <NavLink
                href={l.href}
                label={l.label}
                target={(l as NavItem).target}
                className="block rounded-[var(--radius-md)] border border-[var(--ink)]/15 px-3 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
          <li className="pt-1">
            <Link
              href="/katalog"
              className="block rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent px-4 py-2.5 text-center text-sm font-bold uppercase tracking-wide text-surface shadow-[var(--shadow-md)]"
            >
              Cari Buku
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
