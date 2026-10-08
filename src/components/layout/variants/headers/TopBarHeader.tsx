import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { HeaderVariantProps } from '../types';
import { CATALOG_CTA, LINKS, LogoMark, PANEL_LIST, PANEL_ROW, TAB_LACI } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * TopBarHeader — pita utilitas (alamat/telepon dari settings) sebagai baris
 * entri bertik, lalu rail tab + stempel aksi. Structural variant for ocean-wave.
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
    <header className="sticky top-0 z-40 bg-[var(--surface)] text-[var(--ink)]">
      {(phone || email || address) && (
        <div className="entri bg-brand-strong text-[var(--surface)]">
          <div className="mx-auto flex w-full max-w-[var(--container)] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-xs sm:px-6 lg:px-8">
            <p className="flex min-w-0 items-center gap-1.5 truncate">
              {address ? (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="truncate">{address}</span>
                </span>
              ) : (
                <span className="line-clamp-2">{tag ?? name}</span>
              )}
            </p>
            <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Phone className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {phone}
                </a>
              ) : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Mail className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {email}
                </a>
              ) : null}
            </p>
          </div>
        </div>
      )}
      <div className="border-b border-rule">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex min-h-16 w-full max-w-[var(--container)] items-stretch gap-3 px-4 sm:px-6 lg:px-8"
        >
          {/* blok merek wajib bisa menyusut (min-w-0, tanpa shrink-0) */}
          <Link
            href="/"
            className="my-auto flex items-center min-w-0 md:shrink-0 gap-2.5 rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="pelat-plat hidden 2xl:inline-flex">Katalog</span>
            <LogoMark siteName={name} logoSrc={logoSrc} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-heading text-base font-semibold tracking-tight text-heading sm:text-lg">
                {name}
              </span>
              {tag ? (
                <span className="hidden sm:block truncate text-xs text-[var(--ink)]/70">{tag}</span>
              ) : null}
            </span>
          </Link>

          {/* desktop: tab guide-card di atas garis rail */}
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
              className={`${CATALOG_CTA} rounded-[var(--radius-lg)] bg-accent hover:bg-brand`}
            >
              Cari Buku
            </Link>
          </span>

          <MenuButton
            menuId="menu-topbar-mobile"
            toggleClassName="my-auto grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
          />
        </nav>

        <div id="menu-topbar-mobile" className="hidden bg-[var(--surface)] md:hidden">
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
                className={`${CATALOG_CTA} w-full rounded-[var(--radius-lg)] bg-accent hover:bg-brand`}
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
