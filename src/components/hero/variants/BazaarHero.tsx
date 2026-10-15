'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHeroCarousel } from './useHeroCarousel';
import { HeroFallback } from './HeroFallback';
import type { HeroProps } from './heroProps';
import { resolveBannerHref } from '@/lib/banner-link';

/** Judul dipecah: 3 kata terakhir jadi sorotan marker seperti
 *  `<strong>` di hero toko-shopee. */
function splitHighlight(title: string): { head: string; tail: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { head: '', tail: title };
  return { head: words.slice(0, -3).join(' '), tail: words.slice(-3).join(' ') };
}

/** BazaarHero: bazaar-promo variant. Replika struktur hero toko-shopee —
 *  section full-bleed (bukan kartu), grid copy + struk receipt,
 *  ticker selebar viewport. Same carousel contract, same var tokens. */
export default function BazaarHero({ banners, siteName, tagline }: HeroProps) {
  const total = banners.length;
  const { idx, setIdx, go, setPaused, transitioning, handleTabKeyDown } = useHeroCarousel(total);

  if (total === 0) return <HeroFallback siteName={siteName} tagline={tagline} />;

  const active = banners[idx];
  if (!active) return null;
  const bannerHref = resolveBannerHref(active.link);
  const { head, tail } = splitHighlight(active.title);

  return (
    <section
      aria-label="Sorotan perpustakaan"
      aria-roledescription="carousel"
      aria-busy={transitioning}
      className="relative left-1/2 w-screen max-w-none -translate-x-1/2 border-b-[3px] border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:pt-[4.5rem]">
        <div className="w-full min-w-0 lg:max-w-[35rem] lg:justify-self-end">
          <h1 className="max-w-[12ch] font-heading text-[clamp(2.5rem,1.4rem+4.5vw,4.5rem)] font-bold uppercase leading-[0.98] tracking-[-0.02em] text-heading">
            {head ? `${head} ` : null}
            <strong className="bazaar-marker">{tail}</strong>
          </h1>
          {active.subtitle ? (
            <p className="mt-4 max-w-[34rem] text-[1.125rem] text-[var(--ink)]/75">
              {active.subtitle}
            </p>
          ) : tagline ? (
            <p className="mt-4 max-w-[34rem] text-[1.125rem] text-[var(--ink)]/75">{tagline}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={bannerHref}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-sm)] border-2 border-[var(--ink)] bg-accent px-6 py-3.5 text-[1.1875rem] font-bold uppercase tracking-wide text-white shadow-[var(--shadow-md)] transition hover:translate-y-[2px] hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {active.link ? 'Lihat Selengkapnya' : 'Jelajahi Katalog'}{' '}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/katalog"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-sm)] border-2 border-[var(--ink)] bg-[var(--surface)] px-6 py-3.5 text-base font-bold uppercase tracking-wide text-[var(--ink)] shadow-[var(--shadow-md)] transition hover:translate-y-[2px] hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Lihat Katalog
            </Link>
          </div>
          <p className="mt-4 text-[0.9375rem] text-[var(--ink)]/65">
            {siteName} · gratis dipinjam · dibantu pustakawan sampai dapat
          </p>
          <ul aria-label="Keunggulan layanan" className="mt-7 grid grid-cols-3 gap-3">
            {[
              { strong: 'Gratis', span: 'tanpa biaya pinjam' },
              { strong: '7–14 hari', span: 'masa pinjam normal' },
              { strong: 'Kurasi', span: 'dipilih pustakawan' },
            ].map((m) => (
              <li
                key={m.strong}
                className="grid gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3"
              >
                <strong className="font-heading text-xl uppercase text-heading">{m.strong}</strong>
                <span className="text-[0.8125rem] leading-snug text-[var(--ink)]/65">{m.span}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full min-w-0 pb-14 lg:max-w-[35rem] lg:justify-self-start">
          <div className="grid rotate-[1.25deg] gap-1.5 rounded-[4px] border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]">
            <p className="grid gap-0.5 border-b-2 border-dashed border-[var(--ink)]/25 pb-3 font-heading text-base font-bold uppercase tracking-[0.05em] text-heading">
              {siteName}
              <span className="font-body text-xs font-normal normal-case tracking-normal text-[var(--ink)]/60">
                Kartu katalog · bukan bukti pinjam
              </span>
            </p>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[4px] border-2 border-[var(--ink)]">
              {banners.map((b, i) =>
                i > 1 && i !== idx ? null : (
                  <div
                    key={b.id}
                    role="tabpanel"
                    id={`bazaar-panel-${b.id}`}
                    aria-labelledby={`bazaar-tab-${b.id}`}
                    aria-hidden={i !== idx}
                    className={`absolute inset-0 transition-opacity duration-700 ${
                      i === idx ? 'opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                  >
                    <Image
                      src={b.image_url}
                      alt={i === idx ? b.title : ''}
                      width={1280}
                      height={720}
                      sizes="(max-width:1024px) 100vw, 40vw"
                      priority={i === 0}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      fetchPriority={i === 0 ? 'high' : 'low'}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )
              )}
            </div>
            <div className="flex items-center justify-between gap-4 text-[0.9375rem] text-[var(--ink)]/70">
              <span className="truncate">{active.title}</span>
              <span className="shrink-0 font-bold text-heading">GRATIS</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[0.9375rem] text-[var(--ink)]/70">
              <span>Masa pinjam</span>
              <span className="shrink-0 font-bold text-heading">7–14 HARI</span>
            </div>
            <p className="border-y-2 border-dashed border-[var(--ink)]/25 py-2.5 text-center font-heading text-base font-bold uppercase tracking-[0.06em] text-heading">
              {siteName} · {idx + 1}/{total}
            </p>
            <p className="text-[0.8125rem] text-[var(--ink)]/60">
              telat kembali = denda harian, bisa perpanjang online
            </p>
            <div className="bazaar-barcode mt-1.5 h-11" aria-hidden="true" />
            <p className="mx-auto mt-3 -rotate-[4deg] rounded-[var(--radius-sm)] border-[3px] border-double border-brand bg-brand-soft px-4 py-1.5 font-heading text-sm font-bold uppercase tracking-[0.12em] text-brand">
              Perpus Buka
            </p>
          </div>

          {total > 1 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Banner sebelumnya"
                  className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-sm)] border-2 border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Banner berikutnya"
                  className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-sm)] border-2 border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <div className="flex gap-1.5" role="tablist" aria-label="Pilih banner">
                {banners.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    id={`bazaar-tab-${b.id}`}
                    aria-selected={i === idx}
                    aria-controls={`bazaar-panel-${b.id}`}
                    aria-label={`Banner ${i + 1}: ${b.title}`}
                    onClick={() => setIdx(i)}
                    onKeyDown={(e) => handleTabKeyDown(e, i)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2.5 rounded-full transition-all ${
                        i === idx ? 'w-8 bg-accent' : 'w-3 bg-[var(--ink)]/25'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden bg-brand-strong py-2.5 text-brand-soft" aria-hidden="true">
        <div className="bazaar-ticker-track inline-flex gap-10 whitespace-nowrap px-5 font-heading text-sm font-semibold uppercase tracking-[0.05em]">
          {[...banners, ...banners].map((b, i) => (
            <span key={`${b.id}-${i}`}>
              {b.title} <span className="text-accent">●</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
