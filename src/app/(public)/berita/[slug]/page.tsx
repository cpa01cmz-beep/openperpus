import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Eye } from 'lucide-react';
import { fetchArticleBySlug, fetchArticles, fetchSettings } from '@/lib/books';
import { coverSrc } from '@/lib/cover';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const a = await fetchArticleBySlug(slug);
  if (!a) return { title: 'Berita tidak ditemukan' };
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `${a.title} — ${siteName}`;
  const description = a.excerpt ?? a.title;
  const url = `${getSiteUrl()}/berita/${slug}`;
  const image = coverSrc(a.cover_url, 640) ?? a.cover_url ?? '/og-default.jpg';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: 'id_ID',
      url,
      siteName,
      images: [{ url: image, alt: a.title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** Detail berita: render konten markdown/plain dari tabel articles. */
export default async function BeritaDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await fetchArticleBySlug(slug);
  if (!article) notFound();

  const latest = (await fetchArticles(4)).filter((a) => a.slug !== article.slug).slice(0, 3);
  const cover = coverSrc(article.cover_url, 960) ?? article.cover_url;
  const settings = await fetchSettings();
  const siteUrl = getSiteUrl();
  const orgName = settings.name ?? 'Perpustakaan';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.excerpt ?? undefined,
        image: cover ?? undefined,
        datePublished: article.published_at ?? undefined,
        dateModified: article.published_at ?? undefined,
        author: { '@type': 'Organization', name: orgName, url: siteUrl },
        publisher: {
          '@type': 'Organization',
          name: orgName,
          url: siteUrl,
          ...(settings.logo_url ? { logo: settings.logo_url } : {}),
        },
        mainEntityOfPage: `${siteUrl}/berita/${slug}`,
        url: `${siteUrl}/berita/${slug}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Berita', item: `${siteUrl}/berita` },
          {
            '@type': 'ListItem',
            position: 3,
            name: article.title,
            item: `${siteUrl}/berita/${slug}`,
          },
        ],
      },
    ],
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb
        items={[
          { label: 'Beranda', href: '/' },
          { label: 'Berita', href: '/berita' },
          { label: article.title },
        ]}
      />
      <Link
        href="/berita"
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium text-ink/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Semua berita
      </Link>

      <article className="kartu overflow-hidden">
        {cover && (
          <Image
            src={cover}
            alt={article.excerpt ?? article.title}
            width={960}
            height={540}
            sizes="(max-width:768px) 100vw, 768px"
            priority
            fetchPriority="high"
            className="aspect-[16/9] w-full object-cover"
          />
        )}
        <div className="px-5 pb-8 pt-5 sm:px-8 sm:pt-6">
          <div className="kartu-kop pb-3">
            <h1 className="font-heading text-2xl font-bold leading-tight tracking-[-0.02em] text-heading sm:text-4xl">
              {article.title}
            </h1>
          </div>
          <p className="entri mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.05em] text-brand">
            <span>{article.category ?? 'Berita'}</span>
            {article.published_at && (
              <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <time dateTime={article.published_at}>
                  {new Date(article.published_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {article.views} dibaca
            </span>
          </p>
          {article.excerpt && (
            <p className="mt-4 max-w-[70ch] bg-accent-soft px-4 py-3 text-sm italic leading-relaxed text-ink sm:text-base">
              {article.excerpt}
            </p>
          )}
          <div className="mt-5 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {article.content_md ?? 'Konten menyusul.'}
          </div>
        </div>
      </article>

      {latest.length > 0 && (
        <section aria-labelledby="lainnya" className="kartu px-5 pb-7 pt-5 sm:px-6">
          <div className="kartu-kop pb-3">
            <h2 id="lainnya" className="font-heading text-lg font-bold text-heading">
              Berita lainnya
            </h2>
          </div>
          <ul className="batang mt-3">
            {latest.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/berita/${a.slug}`}
                  className="block px-6 py-2.5 transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
                  {a.published_at && (
                    <time dateTime={a.published_at} className="entri text-xs text-ink/70">
                      {new Date(a.published_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
