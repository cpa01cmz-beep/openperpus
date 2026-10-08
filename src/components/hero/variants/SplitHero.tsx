'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';
import PencarianLaci from '@/components/public/PencarianLaci';

/** SplitHero: ocean-tide — arsip maritim: kolom kiri kop + pelat laci + keterangan,
 *  kolom kanan bidang gambar yang menyembul di bawah garis lipatan. */
export default function SplitHero({ banners, siteName, tagline, categories }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused, transitioning, handleTabKeyDown } = useHeroCarousel(total);

  if (total === 0) {
    return (
      <section aria-label="Sorotan perpustakaan" className="grid gap-4 sm:gap-6">
        <PencarianLaci siteName={siteName} tagline={tagline} categories={categories} />
        <HeroFallback siteName={siteName} tagline={tagline} />
      </section>
    );
  }

  const active = banners[idx];
  if (!active) return null;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      aria-busy={transitioning}
      className="grid overflow-hidden rounded-[var(--radius-lg)] bg-brand-strong text-[var(--surface)] shadow-[var(--shadow-md)] lg:grid-cols-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-col gap-6 p-6 sm:p-10 lg:p-12">
        <PencarianLaci siteName={siteName} tagline={tagline} categories={categories} />

        <div>
          <p className="entri text-xs font-semibold uppercase tracking-wide text-brand-soft">
            {siteName} · {idx + 1}/{total}
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
            {active.title}
          </h1>
          {active.subtitle ? (
            <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-brand-soft sm:text-base">
              {active.subtitle}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={active.link ?? '/katalog'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-6 py-3 text-sm font-bold text-brand-strong shadow-[var(--shadow-md)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface)]"
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
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full border border-[var(--surface)]/40 bg-[var(--ink)]/40 transition hover:bg-[var(--ink)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Banner berikutnya"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full border border-[var(--surface)]/40 bg-[var(--ink)]/40 transition hover:bg-[var(--ink)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="ml-2 flex gap-1.5" role="tablist" aria-label="Pilih banner">
                {banners.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    id={`split-tab-${b.id}`}
                    aria-selected={i === idx}
                    aria-controls={`split-panel-${b.id}`}
                    aria-label={`Banner ${i + 1}: ${b.title}`}
                    onClick={() => setIdx(i)}
                    onKeyDown={(e) => handleTabKeyDown(e, i)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 rounded-full transition-all ${
                        i === idx ? 'w-8 bg-accent' : 'w-3 bg-[var(--surface)]/50'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative min-h-[240px] w-full lg:min-h-[360px]">
        {banners.map((b, i) =>
          i > 1 && i !== idx ? null : (
            <div
              key={b.id}
              role="tabpanel"
              id={`split-panel-${b.id}`}
              aria-labelledby={`split-tab-${b.id}`}
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
      </div>
    </section>
  );
}
