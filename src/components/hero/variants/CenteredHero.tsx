'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';

/** CenteredHero: emerald-centered variant. Surface-framed carousel card with
 *  brand-strong scrim, Playfair display scale, layered emerald shadows. */
export default function CenteredHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] text-center text-[var(--ink)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--brand)]/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] bg-brand-strong text-[var(--surface)] shadow-[var(--shadow-md)] sm:aspect-[21/9]">
        {banners.map((b, i) => (
          <div
            key={b.id}
            aria-hidden={i !== idx}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === idx ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <Image
              src={b.image_url}
              alt={b.title}
              width={1280}
              height={600}
              sizes="100vw"
              unoptimized
              priority={i === 0}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'low'}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-brand-strong/60" aria-hidden="true" />
            <div
              className="absolute inset-0 bg-gradient-to-t from-brand-strong/90 via-brand-strong/40 to-transparent"
              aria-hidden="true"
            />
          </div>
        ))}

        <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            {siteName} · {idx + 1}/{total}
          </p>
          <h1 className="mx-auto mt-2 max-w-2xl font-heading text-3xl font-bold leading-[1.1] tracking-tight drop-shadow-md sm:text-5xl">
            {active.title}
          </h1>
          {active.subtitle ? (
            <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--surface)]/85 sm:text-base">
              {active.subtitle}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={active.link ?? '/katalog'}
              className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow-[var(--shadow-md)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface)]"
            >
              {active.link ? 'Selengkapnya' : 'Jelajahi Katalog'}{' '}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {total > 1 && (
        <>
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Banner sebelumnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-[var(--ink)]/40 text-[var(--surface)] shadow-[var(--shadow-md)] backdrop-blur transition hover:bg-[var(--ink)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Banner berikutnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-[var(--ink)]/40 text-[var(--surface)] shadow-[var(--shadow-md)] backdrop-blur transition hover:bg-[var(--ink)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5"
            role="tablist"
            aria-label="Pilih banner"
          >
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={`Banner ${i + 1}: ${b.title}`}
                onClick={() => setIdx(i)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx
                      ? 'w-8 bg-accent shadow-[var(--shadow-sm)]'
                      : 'w-3 bg-[var(--surface)]/50'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
