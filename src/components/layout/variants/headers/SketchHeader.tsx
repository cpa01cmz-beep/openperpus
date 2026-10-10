import Link from 'next/link';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import NavLink from './NavLink';
import { resolveLogoSrc } from '../types';
import MenuButton from './MenuButton';

/**
 * SketchHeader — hand-drawn notebook header for sketch-notebook.
 * Tape-corner logo card, dashed sketch underline, wobbly pencil borders.
 * Same LINKS, same var tokens.
 */
export default function SketchHeader({
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
    <header className="sticky top-0 z-40 border-b-2 border-dashed border-[var(--ink)]/30 bg-[var(--surface)]/95 backdrop-blur">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="relative inline-block -rotate-2 rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-[var(--surface)] p-0.5 shadow-[var(--shadow-sm)]">
            <LogoMark siteName={name} logoSrc={logoSrc} />
            <span
              aria-hidden="true"
              className="absolute -top-2 left-1/2 h-4 w-10 -translate-x-1/2 rotate-3 rounded-[var(--radius-sm)] bg-brand-soft/80"
            />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-heading text-xl font-bold text-heading">
              {name}
            </span>
            {tag ? (
              <span className="block truncate font-heading text-sm text-[var(--ink)]/70">
                ~ {tag} ~
              </span>
            ) : null}
          </span>
        </Link>

        {/* desktop */}
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href} className="odd:-rotate-1 even:rotate-1">
              <NavLink
                href={l.href}
                label={l.label}
                className="rounded-[var(--radius-md)] border border-transparent px-3 py-2 font-heading text-lg font-semibold text-[var(--ink)] transition hover:-rotate-1 hover:border-[var(--ink)]/30 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="border-[var(--ink)]/30 bg-brand-soft text-brand"
              />
            </li>
          ))}
          <li className="ml-2 -rotate-1">
            <Link
              href="/katalog"
              className="rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent px-4 py-2 font-heading text-lg font-bold text-[var(--surface)] shadow-[var(--shadow-sm)] transition hover:rotate-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cari Buku!
            </Link>
          </li>
        </ul>

        {/* mobile toggle */}
        <MenuButton
          menuId="menu-sketch-mobile"
          toggleClassName="grid h-10 w-10 min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border-2 border-[var(--ink)]/30 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        />
      </nav>

      {/* mobile panel */}
      <div
        id="menu-sketch-mobile"
        className="hidden border-t-2 border-dashed border-[var(--ink)]/20 bg-[var(--surface)] md:hidden"
      >
        <ul className="mx-auto w-full max-w-[var(--container)] space-y-1 px-4 py-3 sm:px-6">
          {LINKS.map((l, i) => (
            <li key={l.href} className={i % 2 === 0 ? '-rotate-[0.5deg]' : 'rotate-[0.5deg]'}>
              <NavLink
                href={l.href}
                label={l.label}
                className="block rounded-[var(--radius-md)] border border-[var(--ink)]/15 bg-[var(--surface)] px-3 py-2.5 font-heading text-lg text-[var(--ink)] shadow-[var(--shadow-sm)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                activeClassName="bg-brand-soft text-brand"
              />
            </li>
          ))}
          <li className="pt-1">
            <Link
              href="/katalog"
              className="block rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent px-4 py-2.5 text-center font-heading text-lg font-bold text-[var(--surface)] shadow-[var(--shadow-sm)]"
            >
              Cari Buku!
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
