import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Eye } from 'lucide-react';
import { fetchArticleBySlug, fetchArticles, fetchSettings } from '@/lib/books';
import { coverSrc } from '@/lib/cover';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const a = await fetchArticleBySlug(params.slug);
  if (!a) return { title: 'Berita tidak ditemukan' };
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `${a.title} — ${siteName}`;
  const description = a.excerpt ?? a.title;
  const url = `${getSiteUrl()}/berita/${params.slug}`;
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
  const article = await fetchArticleBySlug(params.slug);
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
        mainEntityOfPage: `${siteUrl}/berita/${params.slug}`,
        url: `${siteUrl}/berita/${params.slug}`,
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
            item: `${siteUrl}/berita/${params.slug}`,
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
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Semua berita
      </Link>

      <article className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
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
        <div className="p-5 sm:p-8">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-brand">
            <span>{article.category ?? 'Berita'}</span>
            {article.published_at && (
              <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-slate-400">
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
            <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-slate-400">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {article.views} dibaca
            </span>
          </p>
          <h1 className="mt-2 font-heading text-2xl font-bold leading-tight text-heading sm:text-4xl">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="mt-3 border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm italic leading-relaxed text-slate-600 sm:text-base">
              {article.excerpt}
            </p>
          )}
          <div className="prose-sm mt-5 max-w-none whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:prose sm:text-base">
            {article.content_md ?? 'Konten menyusul.'}
          </div>
        </div>
      </article>

      {latest.length > 0 && (
        <section
          aria-labelledby="lainnya"
          className="rounded-lg border border-slate-100 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="lainnya" className="font-heading text-lg font-bold text-heading">
            Berita lainnya
          </h2>
          <ul className="mt-3 space-y-2">
            {latest.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/berita/${a.slug}`}
                  className="block rounded-xl px-3 py-2.5 transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {a.title}
                  </span>
                  {a.published_at && (
                    <time dateTime={a.published_at} className="text-xs text-slate-400">
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
