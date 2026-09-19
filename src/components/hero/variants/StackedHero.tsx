'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';

/** StackedHero: same carousel + fallback, image stacked above text panel. Uses var tokens. */
export default function StackedHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      className="overflow-hidden rounded-none border-2 border-[#111110] bg-brand-strong text-white shadow-[8px_8px_0_0_#111110]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[16/9] w-full sm:aspect-[21/8]">
        {banners.map((b, i) =>
          i > 1 && i !== idx ? null : (
            <div
              key={b.id}
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
            </div>
          )
        )}
        {total > 1 && (
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Banner sebelumnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-none border-2 border-white bg-black text-white transition hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Banner berikutnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-none border-2 border-white bg-black text-white transition hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div className="border-t-2 border-[#111110] p-5 sm:p-8">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          {siteName} · {idx + 1}/{total}
        </p>
        <h1 className="mt-1 max-w-2xl font-heading text-2xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
          {active.title}
        </h1>
        {active.subtitle ? (
          <p className="mt-2 max-w-xl font-body text-sm text-brand-soft sm:text-base">
            {active.subtitle}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={active.link ?? '/katalog'}
            className="inline-flex items-center gap-2 rounded-none border-2 border-[#111110] bg-accent px-5 py-2.5 font-body text-sm font-bold uppercase tracking-wide text-[#111110] shadow-[4px_4px_0_0_#111110] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {active.link ? 'Selengkapnya' : 'Jelajahi Katalog'}{' '}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {total > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label="Pilih banner">
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
                    className={`h-2 rounded-none border border-[#111110] transition-all ${
                      i === idx ? 'w-8 bg-accent' : 'w-4 bg-white'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
