"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useHeroCarousel } from "./useHeroCarousel";
import { HeroFallback } from "./HeroFallback";
import type { HeroProps } from "./heroProps";

/** EditorialHero: same carousel + fallback, editorial side-caption composition. Uses var tokens. */
export default function EditorialHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      className="grid overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] text-[var(--ink)] lg:grid-cols-[1.5fr_1fr]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[16/10] w-full lg:aspect-auto lg:min-h-[320px]">
        {banners.map((b, i) => (
          <div
            key={b.id}
            aria-hidden={i !== idx}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === idx ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src={b.image_url}
              alt={b.title}
              width={1280}
              height={600}
              sizes="100vw"
              unoptimized
              priority={i === idx}
              loading={i === idx ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col justify-center border-t border-[var(--ink)]/10 p-6 sm:p-8 lg:border-l lg:border-t-0" style={{ padding: 'var(--spacing-card)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink)] opacity-70">
          {siteName} · {idx + 1}/{total}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold leading-tight text-[var(--ink)] sm:text-3xl">
          {active.title}
        </h1>
        {active.subtitle ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--ink)] opacity-80 sm:text-base">{active.subtitle}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={active.link ?? "/katalog"}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-strong)] px-5 py-2.5 text-sm font-bold text-[var(--surface)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {active.link ? "Selengkapnya" : "Jelajahi Katalog"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {total > 1 && (
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Banner sebelumnya" className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Banner berikutnya" className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--ink)]/15 text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
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
                  className={`h-1.5 rounded-[var(--radius-sm)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    i === idx ? "w-8 bg-[var(--brand-strong)]" : "w-3 bg-[var(--ink)]/25 hover:bg-[var(--ink)]/45"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
