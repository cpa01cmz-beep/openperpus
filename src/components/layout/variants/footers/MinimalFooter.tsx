import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import type { NavItem } from '@/lib/types';
import { FOOTER_LINKS } from '../shared';

/**
 * MinimalFooter — single centered column: brand, tagline, inline links, copyright.
 * Structural variant for paper-colophon / midnight slim. Same var tokens.
 */
export default function MinimalFooter({ settings, menus }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';
  const footerLinks: NavItem[] = menus && menus.length > 0 ? menus : FOOTER_LINKS;

  return (
    <footer
      role="contentinfo"
      className="mt-12 border-t border-[var(--ink)]/10 bg-[var(--surface)] text-[var(--ink)]"
    >
      <div className="mx-auto flex w-full max-w-[var(--container)] flex-col items-center gap-3 px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="flex items-center gap-2">
          {settings.logo_url ? (
            <Image
              src={settings.logo_url}
              alt={`Logo ${name}`}
              width={36}
              height={36}
              sizes="36px"
              className="h-9 w-9 rounded-[var(--radius-md)] object-cover"
              loading="lazy"
            />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-[var(--ink)]"
              aria-hidden="true"
            >
              <BookOpenText className="h-5 w-5" />
            </span>
          )}
          <span className="font-heading text-lg font-bold text-[var(--ink)]">{name}</span>
        </p>
        {settings.tagline ? (
          <p className="max-w-prose text-sm leading-relaxed text-[var(--ink)] opacity-70">
            {settings.tagline}
          </p>
        ) : null}
        <nav aria-label="Tautan cepat">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            {footerLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  target={l.target === '_blank' ? '_blank' : undefined}
                  rel={l.target === '_blank' ? 'noreferrer noopener' : undefined}
                  className="rounded text-[var(--ink)] opacity-70 transition hover:opacity-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-[var(--ink)] opacity-60">
          © {new Date().getFullYear()} {name}. Seluruh konten dinamis dari sistem perpustakaan.
        </p>
      </div>
    </footer>
  );
}
