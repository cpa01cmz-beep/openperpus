import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Megaphone, Quote } from 'lucide-react';
import { getSiteUrl } from '@/lib/site';
import { HeroFallback } from '@/components/hero/variants/HeroFallback';
import StatsBar from '@/components/public/StatsBar';
import BookCard from '@/components/public/BookCard';
import TestimonialCard from '@/components/public/TestimonialCard';
import { getTheme } from '@/lib/themes';
import {
  fetchArticles,
  fetchBanners,
  fetchBooks,
  fetchSettings,
  fetchStats,
  fetchTestimonials,
} from '@/lib/books';
import { coverSrc } from '@/lib/cover';

const HeroSwitch = dynamic(() => import('@/components/hero/HeroSwitch'), {
  ssr: true,
  loading: () => <HeroFallback siteName="Perpustakaan Digital" />,
});

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const title = s.seo_title ?? `${s.name ?? 'Perpustakaan Digital'} — Beranda`;
  const description =
    s.seo_desc ?? s.tagline ?? 'Jelajahi katalog, berita, dan layanan perpustakaan.';
  const siteUrl = getSiteUrl();
  return {
    title,
    description,
    alternates: { canonical: siteUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      url: siteUrl,
      siteName: s.name ?? 'Perpustakaan Digital',
      images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-default.jpg'] },
  };
}

/** Landing publik: sections dirender sesuai theme layout.homepageSections (ordered, on/off). */
export default async function PublicHomePage() {
  const [settings, banners, featured, articles, testimonials, stats] = await Promise.all([
    fetchSettings(),
    fetchBanners(),
    fetchBooks({ featured: true, limit: 8 }),
    fetchArticles(3),
    fetchTestimonials(3),
    fetchStats(),
  ]);

  const siteName = settings.name ?? 'Perpustakaan Digital';
  const fallbackFeatured = featured.length > 0 ? featured : await fetchBooks({ limit: 8 });
  const lcpImage = banners[0]?.image_url ?? null;

  const theme = getTheme(settings.active_theme ?? 'emerald');
  const orderedSections =
    theme.layout.homepageSections.length > 0
      ? theme.layout.homepageSections
      : [
          { id: 'hero', enabled: true },
          { id: 'announcement', enabled: true },
          { id: 'stats', enabled: true },
          { id: 'welcome', enabled: true },
          { id: 'featured', enabled: true },
          { id: 'news', enabled: true },
          { id: 'testimonials', enabled: true },
        ];

  const sectionMap: Record<string, React.ReactNode> = {
    hero: (
      <HeroSwitch
        variant={theme.layout.heroVariant}
        banners={banners}
        siteName={siteName}
        tagline={settings.tagline}
      />
    ),
    announcement: settings.announcement ? (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg border border-accent-soft bg-accent-soft px-4 py-3 text-sm text-heading shadow-sm"
      >
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{settings.announcement}</span>
      </p>
    ) : null,
    stats: (
      <StatsBar
        totalBooks={stats.totalBooks}
        totalCopies={stats.totalCopies}
        totalCategories={stats.totalCategories}
        totalArticles={stats.totalArticles}
      />
    ),
    welcome: settings.welcome_text ? (
      <section
        aria-labelledby="sambutan"
        className="overflow-hidden rounded-lg border border-brand-strong/10 bg-gradient-to-br from-brand-soft to-white p-6 shadow-sm sm:p-8"
      >
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand">
          <Quote className="h-4 w-4" aria-hidden="true" /> Sambutan
        </p>
        <h2 id="sambutan" className="mt-2 font-heading text-2xl font-bold text-heading sm:text-3xl">
          Selamat datang di {siteName}
        </h2>
        <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
          {settings.welcome_text}
        </p>
      </section>
    ) : null,
    featured: (
      <section aria-labelledby="unggulan">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
              Pilihan pustakawan
            </p>
            <h2
              id="unggulan"
              className="mt-1 font-heading text-2xl font-bold text-heading sm:text-3xl"
            >
              Buku Unggulan
            </h2>
          </div>
          <Link
            href="/katalog"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-soft bg-white px-4 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Lihat semua <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {fallbackFeatured.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
            {fallbackFeatured.slice(0, 8).map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            Koleksi unggulan belum tersedia. Silakan jelajahi{' '}
            <Link href="/katalog" className="font-semibold text-brand underline">
              katalog
            </Link>
            .
          </div>
        )}
      </section>
    ),
    news: (
      <section aria-labelledby="berita">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
              Kabar terbaru
            </p>
            <h2
              id="berita"
              className="mt-1 font-heading text-2xl font-bold text-heading sm:text-3xl"
            >
              Berita & Artikel
            </h2>
          </div>
          <Link
            href="/berita"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-soft bg-white px-4 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Semua berita <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {articles.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/berita/${a.slug}`}
                className="group overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="aspect-[16/9] w-full overflow-hidden bg-brand-soft">
                  {a.cover_url ? (
                    <Image
                      src={coverSrc(a.cover_url, 640) ?? a.cover_url}
                      alt={a.title}
                      width={640}
                      height={360}
                      sizes="(max-width:640px) 100vw, 33vw"
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div
                      className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-strong to-brand p-4 text-center font-heading text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      {a.title}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {a.category && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                      {a.category}
                    </p>
                  )}
                  <h3 className="mt-1 line-clamp-2 font-heading text-base font-bold text-slate-900 group-hover:text-brand">
                    {a.title}
                  </h3>
                  {a.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.excerpt}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            Belum ada berita yang dipublikasikan.
          </div>
        )}
      </section>
    ),
    testimonials:
      testimonials.length > 0 ? (
        <section aria-labelledby="testimoni">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Kata pembaca</p>
          <h2
            id="testimoni"
            className="mt-1 font-heading text-2xl font-bold text-heading sm:text-3xl"
          >
            Testimoni Pengunjung
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} item={t} />
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className="space-y-10 sm:space-y-12">
      {lcpImage ? <link rel="preload" as="image" href={lcpImage} fetchPriority="high" /> : null}
      {orderedSections
        .filter((s) => s.enabled)
        .map((s) => {
          const node = sectionMap[s.id] ?? null;
          if (!node) return null;
          return <div key={s.id}>{node}</div>;
        })}
    </div>
  );
}
