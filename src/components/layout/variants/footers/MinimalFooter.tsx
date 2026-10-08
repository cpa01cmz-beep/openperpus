import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import { FOOTER_LINKS } from '../shared';

/**
 * MinimalFooter — kartu kolofon datar: kop bergaris kembar, merek serif,
 * baris tautan sebagai entri bertik. Rambut-rambut garis saja, tanpa bayangan.
 * Structural variant for paper-colophon / midnight slim.
 */
export default function MinimalFooter({ settings }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';

  return (
    <footer
      role="contentinfo"
      className="mt-12 border-t border-rule bg-[var(--surface)] text-[var(--ink)]"
    >
      <div className="mx-auto flex w-full max-w-[var(--container)] flex-col items-center gap-3 px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="kartu-kop flex items-center gap-2 pb-3">
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
          <p className="entri max-w-prose text-sm leading-relaxed text-[var(--ink)] opacity-70">
            {settings.tagline}
          </p>
        ) : null}
        <nav aria-label="Tautan cepat">
          <ul className="entri flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] text-[var(--ink)] opacity-70 transition hover:opacity-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="entri text-xs text-[var(--ink)] opacity-60">
          © {new Date().getFullYear()} {name}. Seluruh konten dinamis dari sistem perpustakaan.
        </p>
      </div>
    </footer>
  );
}
