import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Elegant fallback when no banners exist. Shared by all hero variants. Uses var tokens. */
export function HeroFallback({ siteName, tagline }: { siteName: string; tagline?: string | null }) {
  return (
    <section aria-label="Sambutan" className="overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-brand-strong via-brand to-brand text-white shadow">
      <div className="px-6 py-12 sm:px-10 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Selamat datang di
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold leading-tight sm:text-5xl">
          {siteName}
        </h1>
        {tagline ? <p className="mt-3 max-w-xl text-brand-soft">{tagline}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/katalog"
            className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Jelajahi Katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/layanan"
            className="inline-flex items-center rounded-[var(--radius-lg)] border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Layanan Kami
          </Link>
        </div>
      </div>
    </section>
  );
}
