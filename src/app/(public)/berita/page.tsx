import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';
import { fetchArticles, fetchSettings } from '@/lib/books';
import { coverSrc } from '@/lib/cover';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `Berita & Artikel — ${siteName}`;
  const description = `Kabar, kegiatan, dan artikel literasi dari ${siteName}.`;
  const canonical = `${getSiteUrl()}/berita`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      url: canonical,
      siteName,
      images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-default.jpg'],
    },
  };
}

/** Arsip berita: kartu dari tabel articles (status published). */
export default async function BeritaPage() {
  const [articles] = await Promise.all([fetchArticles(24)]);

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Beranda', item: getSiteUrl() },
              { '@type': 'ListItem', position: 2, name: 'Berita', item: `${getSiteUrl()}/berita` },
            ],
          }),
        }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Berita' }]} />
      {/* Kop kartu arsip: judul + garis ganda, keterangan di bawah garis */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Berita & Artikel
          </h1>
        </div>
        <p className="mt-3 text-sm text-ink/70 sm:text-base">
          Kegiatan, pengumuman, dan bacaan literasi terbaru.
        </p>
      </header>

      {articles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a, n) => (
            <Link
              key={a.id}
              href={`/berita/${a.slug}`}
              style={{ ['--i' as never]: n } as React.CSSProperties}
              className="kartu riffle group overflow-hidden transition hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                    className="h-full w-full object-cover transition duration-300"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center p-4" aria-hidden="true">
                    <Newspaper className="h-8 w-8 text-brand" />
                  </div>
                )}
              </div>
              <div className="px-4 pb-8 pt-4 sm:px-5 sm:pb-9">
                <div className="kartu-kop pb-2">
                  <h2 className="line-clamp-2 font-heading text-lg font-bold leading-snug text-heading transition group-hover:text-brand">
                    {a.title}
                  </h2>
                </div>
                <p className="entri mt-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.05em] text-brand">
                  {a.category ?? 'Berita'}
                  {a.published_at && (
                    <time
                      dateTime={a.published_at}
                      className="font-normal normal-case tracking-normal"
                    >
                      {new Date(a.published_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </time>
                  )}
                </p>
                {a.excerpt && <p className="mt-2 line-clamp-2 text-sm text-ink/70">{a.excerpt}</p>}
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                  Baca selengkapnya{' '}
                  <ArrowRight
                    className="h-4 w-4 transition group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="kartu px-6 py-12 text-center">
          <h2 className="entri text-sm uppercase tracking-[0.05em] text-ink">Belum ada berita</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/70">
            Berita yang dipublikasikan pustakawan akan muncul di sini.
          </p>
        </div>
      )}
    </div>
  );
}
