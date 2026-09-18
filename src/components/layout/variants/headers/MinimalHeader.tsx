"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { HeaderVariantProps } from '../types';
import { LINKS, LogoMark } from '../shared';
import { resolveLogoSrc } from '../types';

/**
 * MinimalHeader — slim single row, text links only, no CTA button.
 * Structural variant for paper-minimal / midnight-slim.
 */
export default function MinimalHeader({ siteName, tagline, settings, logo_url, logoUrl }: HeaderVariantProps) {
  const [open, setOpen] = useState(false);
  const logoSrc = resolveLogoSrc({ logo_url, logoUrl }) ?? settings?.logo_url ?? null;
  const name = siteName || settings?.name || 'Perpustakaan Digital';
  const tag = tagline ?? settings?.tagline ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-brand-strong/10 bg-[var(--surface)]/90 backdrop-blur">
      <nav
        aria-label="Navigasi utama"
        className="mx-auto flex h-12 w-full max-w-[var(--container)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      >
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <LogoMark siteName={name} logoSrc={logoSrc} size="sm" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-heading text-sm font-bold text-[var(--ink)]">{name}</span>
            {tag ? <span className="hidden truncate text-[11px] text-[var(--ink)] opacity-70 sm:block">{tag}</span> : null}
          </span>
        </Link>

        <ul className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-minimal-mobile"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div id="menu-minimal-mobile" className="border-t border-[var(--ink)]/10 bg-[var(--surface)] md:hidden">
          <ul className="mx-auto w-full max-w-[var(--container)] space-y-1 px-4 py-3 sm:px-6">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
