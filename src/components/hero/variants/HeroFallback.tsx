import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Token-panel fallback when no banners exist. Shared by all hero variants.
 *  Kartu-katalog letterhead flash: call number, site name, tagline, CTAs — no decoration. */
export function HeroFallback({ siteName, tagline }: { siteName: string; tagline?: string | null }) {
  return (
    <section
      aria-label="Sambutan"
      className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--brand-strong)] px-6 pb-12 pt-10 text-[var(--surface)] shadow-[var(--shadow-md)] sm:px-10 sm:pb-16 sm:pt-12"
    >
      <span
        aria-hidden="true"
        className="entri absolute left-4 top-4 border border-[var(--surface)] px-1.5 py-0.5 text-xs uppercase tracking-[0.04em] sm:left-6 sm:top-6"
      >
        020 ABA
      </span>
      <div className="border-b border-[var(--surface)] pb-4 sm:pl-24">
        <p className="entri text-xs font-semibold uppercase tracking-[0.2em]">Selamat datang di</p>
        <h1 className="entri mt-2 text-2xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-3xl lg:text-4xl">
          {siteName}
        </h1>
        {tagline ? <p className="entri mt-3 text-sm">{tagline}</p> : null}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/katalog"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-5 py-2.5 text-sm font-bold text-[var(--surface)] shadow-[var(--shadow-md)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface)]"
        >
          Jelajahi Katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/layanan"
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-lg)] border border-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface)]"
        >
          Layanan Kami
        </Link>
      </div>
    </section>
  );
}
