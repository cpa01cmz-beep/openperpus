import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * TopBarHeader — utility top bar (contact/address from settings) + main nav row.
 * Structural variant for ocean-wave. Same LINKS, same var tokens.
 */
export default function TopBarHeader({
  siteName,
  tagline,
  settings,
  logo_url,
  logoUrl,
}: HeaderVariantProps) {
  const logoSrc = resolveLogoSrc({ logo_url, logoUrl }) ?? settings?.logo_url ?? null;
  const name = siteName || settings?.name || 'Perpustakaan Digital';
  const tag = tagline ?? settings?.tagline ?? null;
  const phone = settings?.phone ?? null;
  const email = settings?.email ?? null;
  const address = settings?.address ?? null;

  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur">
      {(phone || email || address) && (
        <div className="bg-brand-strong text-brand-soft">
          <div className="mx-auto flex w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 py-1.5 text-xs sm:px-6 lg:px-8">
            <p className="flex min-w-0 items-center gap-1.5 truncate">
              {address ? (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="truncate">{address}</span>
                </span>
              ) : (
                <span className="truncate">{tag ?? name}</span>
              )}
            </p>
            <p className="hidden shrink-0 items-center gap-3 sm:flex">
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-1 rounded hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {phone}
                </a>
              ) : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-1 rounded hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {email}
                </a>
              ) : null}
            </p>
          </div>
        </div>
      )}
      <div className="border-b border-brand-strong/10">
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
              <span className="block truncate font-heading text-base font-semibold tracking-tight text-heading sm:text-lg">
                {name}
              </span>
              {tag ? (
                <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-[var(--ink)] opacity-70">
                  {tag}
                </span>
              ) : null}
            </span>
          </Link>

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
                className="rounded-[var(--radius-lg)] bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Cari Buku
              </Link>
            </li>
          </ul>

          <MenuButton
            menuId="menu-topbar-mobile"
            toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
          />
        </nav>

        <div
          id="menu-topbar-mobile"
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
                className="block rounded-[var(--radius-lg)] bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:brightness-105"
              >
                Cari Buku
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
