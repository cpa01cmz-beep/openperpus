'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';

/** ClassicHero: exact reuse of public/Hero carousel logic. Emerald default.
 * Midnight luxury-dark: navy surface, gold hairline, Cormorant display, deep black shadows. */
export default function ClassicHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused } = useHeroCarousel(total);

  // Track transition state for aria-busy
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard navigation for tabs
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIdx: number) => {
      let newIdx = currentIdx;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        newIdx = (currentIdx + 1) % total;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newIdx = (currentIdx - 1 + total) % total;
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIdx = total - 1;
      }
      if (newIdx !== currentIdx) {
        setIdx(newIdx);
        setIsTransitioning(true);
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 700);
      }
    },
    [total, setIdx]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;

  // LCP optimization: only preload first 2 images; defer rest until user interacts
  const preloadCount = 2;
  const shouldPreload = (i: number) => i < preloadCount || i === idx;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      aria-busy={isTransitioning}
      className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-lg)] ring-1 ring-accent/25"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
        {banners.map((b, i) =>
          !shouldPreload(i) && i !== idx ? null : (
            <div
              key={b.id}
              role="tabpanel"
              id={`classic-panel-${b.id}`}
              aria-labelledby={`classic-tab-${b.id}`}
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
                className="absolute inset-0 bg-gradient-to-t from-brand-strong/90 via-brand-strong/40 to-transparent"
                aria-hidden="true"
              />
            </div>
          )
        )}

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent [font-family:var(--font-cormorant)]">
            {siteName} · {idx + 1}/{total}
          </p>
          <h1 className="mt-1 max-w-2xl font-cormorant text-2xl font-bold leading-tight text-[var(--ink)] sm:text-4xl">
            {active.title}
          </h1>
          {active.subtitle ? (
            <p className="mt-2 max-w-xl text-sm text-[var(--ink)]/80 sm:text-base">
              {active.subtitle}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {active.link ? (
              <Link
                href={active.link}
                className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] border border-accent/40 bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow-[var(--shadow-md)] transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Selengkapnya <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                href="/katalog"
                className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] border border-accent/40 bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow-[var(--shadow-md)] transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Jelajahi Katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
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
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full border border-accent/30 bg-[var(--surface)]/60 text-[var(--ink)] backdrop-blur transition hover:bg-[var(--surface)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Banner berikutnya"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full border border-accent/30 bg-[var(--surface)]/60 text-[var(--ink)] backdrop-blur transition hover:bg-[var(--surface)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div
            className="absolute bottom-4 right-5 flex gap-1.5 sm:right-8"
            role="tablist"
            aria-label="Pilih banner"
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                id={`classic-tab-${b.id}`}
                aria-selected={i === idx}
                aria-controls={`classic-panel-${b.id}`}
                aria-label={`Banner ${i + 1}: ${b.title}`}
                onClick={() => {
                  setIdx(i);
                  setIsTransitioning(true);
                  if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
                  transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 700);
                }}
                onKeyDown={(e) => handleKeyDown(e, i)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx ? 'w-8 bg-accent' : 'w-3 bg-[var(--ink)]/40'
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
