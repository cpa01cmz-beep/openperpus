'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';
import { resolveBannerHref } from '@/lib/banner-link';

/** SketchHero: sketch-doodle variant. Doodle-framed carousel on cream paper
 *  with hand-lettered headings, tape corners, wobbly pencil borders. */
export default function SketchHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused, transitioning, handleTabKeyDown } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;
  const bannerHref = resolveBannerHref(active.link);

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      aria-busy={transitioning}
      className="relative -rotate-[0.4deg] overflow-hidden rounded-[var(--radius-lg)] border-2 border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-lg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* tape corners */}
      <span
        aria-hidden="true"
        className="absolute -left-2 top-6 z-10 h-6 w-16 -rotate-45 rounded-[var(--radius-sm)] bg-brand-soft/90"
      />
      <span
        aria-hidden="true"
        className="absolute -right-2 top-6 z-10 h-6 w-16 rotate-45 rounded-[var(--radius-sm)] bg-brand-soft/90"
      />
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b-2 border-dashed border-[var(--ink)]/30 sm:aspect-[21/9]">
        {banners.map((b, i) =>
          i > 1 && i !== idx ? null : (
            <div
              key={b.id}
              role="tabpanel"
              id={`sketch-panel-${b.id}`}
              aria-labelledby={`sketch-tab-${b.id}`}
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
                className="h-full w-full object-cover [filter:saturate(0.92)_contrast(1.03)]"
              />
              <div
                className="absolute inset-0 border-[6px] border-[var(--surface)]"
                aria-hidden="true"
              />
            </div>
          )
        )}
        <p className="absolute left-4 top-4 inline-flex -rotate-2 items-center gap-1.5 rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent-soft px-3 py-1 font-heading text-lg text-heading shadow-[var(--shadow-sm)]">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          sketsa no. {idx + 1}/{total}
        </p>
      </div>

      <div className="relative p-6 text-center sm:p-8">
        <svg
          aria-hidden="true"
          viewBox="0 0 220 12"
          className="mx-auto h-3 w-48 text-accent"
          fill="none"
        >
          <path
            d="M3 8 C 40 3, 70 10, 110 6 S 180 3, 217 7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <p className="mt-2 font-heading text-xl text-[var(--ink)]/75">~ {siteName} ~</p>
        <h1 className="mx-auto mt-1 max-w-2xl -rotate-1 font-heading text-4xl font-bold leading-[1.05] text-heading sm:text-5xl">
          {active.title}
        </h1>
        {active.subtitle ? (
          <p className="mx-auto mt-3 max-w-xl font-heading text-2xl leading-snug text-[var(--ink)]/85">
            {active.subtitle}
          </p>
        ) : tagline ? (
          <p className="mx-auto mt-3 max-w-xl font-heading text-2xl leading-snug text-[var(--ink)]/85">
            {tagline}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={bannerHref}
            className="inline-flex rotate-1 items-center gap-2 rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-accent px-6 py-3 font-heading text-2xl font-bold text-[var(--surface)] shadow-[var(--shadow-md)] transition hover:-rotate-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {active.link ? 'Lihat coretannya!' : 'Jelajahi Katalog!'}{' '}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        {total > 1 && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Banner sebelumnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border-2 border-[var(--ink)]/40 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex gap-1.5" role="tablist" aria-label="Pilih banner">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  id={`sketch-tab-${b.id}`}
                  aria-selected={i === idx}
                  aria-controls={`sketch-panel-${b.id}`}
                  aria-label={`Banner ${i + 1}: ${b.title}`}
                  onClick={() => setIdx(i)}
                  onKeyDown={(e) => handleTabKeyDown(e, i)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-3 rounded-full border-2 border-[var(--ink)] transition-all ${
                      i === idx ? 'w-9 -rotate-3 bg-accent' : 'w-4 rotate-2 bg-brand-soft'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Banner berikutnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border-2 border-[var(--ink)]/40 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
