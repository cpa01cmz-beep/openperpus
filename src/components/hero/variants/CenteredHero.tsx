'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';
import { resolveBannerHref } from '@/lib/banner-link';
import PencarianLaci from '@/components/public/PencarianLaci';

/** CenteredHero: emerald-centered variant — pelat depan laci jati, kartu indeks
 *  terpusat di atas pelat label pencarian, kartu isi laci di bawah garis lipatan. */
export default function CenteredHero({ banners, siteName, tagline, categories }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused, transitioning, handleTabKeyDown } = useHeroCarousel(total);

  const pencarian = <PencarianLaci siteName={siteName} tagline={tagline} categories={categories} />;

  if (total === 0) {
    return (
      <section aria-label="Sorotan perpustakaan" className="grid gap-4 sm:gap-6">
        {pencarian}
        <HeroFallback siteName={siteName} tagline={tagline} />
      </section>
    );
  }

  const active = banners[idx];
  if (!active) return null;
  const bannerHref = resolveBannerHref(active.link);

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      aria-busy={transitioning}
      className="relative grid gap-6 p-4 text-center text-[var(--ink)] sm:p-6 lg:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {pencarian}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule)] bg-brand-strong shadow-[var(--shadow-md)] sm:aspect-[21/9]">
        {banners.map((b, i) =>
          i > 1 && i !== idx ? null : (
            <div
              key={b.id}
              role="tabpanel"
              id={`centered-panel-${b.id}`}
              aria-labelledby={`centered-tab-${b.id}`}
              aria-hidden={i !== idx}
              className={`absolute inset-0 transition-opacity duration-700 ${
                i === idx ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <Image
                src={b.image_url}
                alt={i === idx ? b.title : ''}
                width={1280}
                height={600}
                sizes="100vw"
                priority={i === 0}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'low'}
                className="h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-brand-strong/98 via-brand-strong/94 to-brand-strong/90"
                aria-hidden="true"
              />
            </div>
          )
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 py-6 text-center sm:px-8">
          <p className="entri hidden text-xs tracking-[0.04em] text-[var(--surface)]/80 sm:block">
            {siteName} · {idx + 1}/{total}
          </p>
          <h1 className="mx-auto mt-2 max-w-2xl font-heading text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-[var(--surface)] drop-shadow-md sm:text-5xl">
            {active.title}
          </h1>
          {active.subtitle ? (
            <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--surface)]/85 sm:text-base">
              {active.subtitle}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={bannerHref}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-5 py-2.5 text-sm font-bold text-surface shadow-[var(--shadow-md)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface)]"
            >
              {active.link ? 'Selengkapnya' : 'Jelajahi Katalog'}{' '}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {total > 1 && (
          <>
            <div className="absolute right-4 top-4 hidden gap-2 lg:flex">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Banner sebelumnya"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-[var(--ink)]/50 text-[var(--surface)] shadow-[var(--shadow-md)] transition hover:bg-[var(--ink)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Banner berikutnya"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-[var(--ink)]/50 text-[var(--surface)] shadow-[var(--shadow-md)] transition hover:bg-[var(--ink)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <div
          className="flex justify-center gap-1.5"
          role="tablist"
          aria-label="Pilih banner"
          onKeyDown={(e) => handleTabKeyDown(e, idx)}
        >
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              id={`centered-tab-${b.id}`}
              aria-selected={i === idx}
              aria-controls={`centered-panel-${b.id}`}
              aria-label={`Banner ${i + 1}: ${b.title}`}
              onClick={() => setIdx(i)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
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
      )}
    </section>
  );
}
