import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
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
  fetchCategories,
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

/** Kop seksi: judul + garis ganda tercetak di bawahnya (label laci, bukan eyebrow). */
function KopSeksi({ id, judul, aksi }: { id: string; judul: string; aksi?: React.ReactNode }) {
  return (
    <div className="kartu-kop flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3">
      <h2 id={id} className="font-heading text-2xl font-bold text-heading sm:text-3xl">
        {judul}
      </h2>
      {aksi}
    </div>
  );
}

function TautanSeksi({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 self-end rounded-[var(--radius-md)] border border-rule bg-surface px-4 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function Kosong({ children }: { children: React.ReactNode }) {
  return (
    <div className="kartu px-6 py-10 text-center">
      <p className="entri text-sm text-ink/75">{children}</p>
    </div>
  );
}

const tanggal = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

/** Landing publik: sections dirender sesuai theme layout.homepageSections (ordered, on/off). */
export default async function PublicHomePage() {
  const [settings, banners, featured, fallbackBooks, articles, testimonials, stats, categories] =
    await Promise.all([
      fetchSettings(),
      fetchBanners(),
      fetchBooks({ featured: true, limit: 8 }),
      fetchBooks({ limit: 8 }),
      fetchArticles(3),
      fetchTestimonials(3),
      fetchStats(),
      fetchCategories(),
    ]);

  const siteName = settings.name ?? 'Perpustakaan Digital';
  const fallbackFeatured = featured.length > 0 ? featured : fallbackBooks;
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
        categories={categories}
      />
    ),
    announcement: settings.announcement ? (
      <p
        role="status"
        className="kartu riffle flex items-start gap-3 bg-accent-soft px-5 py-4 text-sm leading-relaxed text-heading"
      >
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
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
      <section aria-labelledby="sambutan" className="kartu px-5 py-6 sm:px-8 sm:py-8">
        <KopSeksi id="sambutan" judul={`Selamat datang di ${siteName}`} />
        <p className="mt-5 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-ink sm:text-base">
          {settings.welcome_text}
        </p>
      </section>
    ) : null,
    featured: (
      <section aria-labelledby="unggulan">
        <KopSeksi
          id="unggulan"
          judul="Buku Unggulan"
          aksi={<TautanSeksi href="/katalog" label="Lihat semua" />}
        />
        {fallbackFeatured.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
            {fallbackFeatured.slice(0, 8).map((b) => (
              <div key={b.id} className="riffle" style={{ '--i': 0 } as React.CSSProperties}>
                <BookCard book={b} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <Kosong>Koleksi unggulan belum tersedia. Silakan jelajahi katalog.</Kosong>
          </div>
        )}
      </section>
    ),
    news: (
      <section aria-labelledby="berita">
        <KopSeksi
          id="berita"
          judul="Berita & Artikel"
          aksi={<TautanSeksi href="/berita" label="Semua berita" />}
        />
        {articles.length > 0 ? (
          <ul className="batang mt-2">
            {articles.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/berita/${a.slug}`}
                  className="group flex flex-col gap-1 py-4 pl-8 pr-1 sm:flex-row sm:items-baseline sm:gap-5"
                >
                  <span className="entri shrink-0 text-xs text-ink/75">
                    {tanggal(a.published_at)}
                  </span>
                  {a.category ? (
                    <span className="entri shrink-0 text-xs uppercase tracking-wider text-brand">
                      {a.category}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block font-heading text-base font-semibold text-heading transition group-hover:text-brand">
                      {a.title}
                    </span>
                    {a.excerpt ? (
                      <span className="mt-1 line-clamp-2 block max-w-[68ch] text-sm text-ink/75">
                        {a.excerpt}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <Kosong>Belum ada berita yang dipublikasikan.</Kosong>
          </div>
        )}
      </section>
    ),
    testimonials:
      testimonials.length > 0 ? (
        <section aria-labelledby="testimoni">
          <KopSeksi id="testimoni" judul="Testimoni Pengunjung" />
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} item={t} />
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className="space-y-[var(--spacing-section)]">
      {lcpImage ? (
        <link
          rel="preload"
          as="image"
          href={coverSrc(lcpImage, 640) ?? lcpImage}
          fetchPriority="high"
        />
      ) : null}
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
