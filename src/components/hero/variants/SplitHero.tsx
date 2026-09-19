'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';

/** SplitHero: same carousel + fallback, split text-left / image-right. Uses var tokens. */
export default function SplitHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      className="grid overflow-hidden rounded-[var(--radius-lg)] bg-brand-strong text-white shadow-[var(--shadow-md)] lg:grid-cols-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {siteName} · {idx + 1}/{total}
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
          {active.title}
        </h1>
        {active.subtitle ? (
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-brand-soft/90 sm:text-base">
            {active.subtitle}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={active.link ?? '/katalog'}
            className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-md)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {active.link ? 'Selengkapnya' : 'Jelajahi Katalog'}{' '}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {total > 1 && (
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Banner sebelumnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Banner berikutnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="ml-2 flex gap-1.5" role="tablist" aria-label="Pilih banner">
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
                      i === idx ? 'w-8 bg-accent' : 'w-3 bg-white/50'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative min-h-[240px] w-full lg:min-h-[360px]">
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
            <div
              className="absolute inset-0 bg-gradient-to-r from-brand-strong/60 to-transparent"
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
