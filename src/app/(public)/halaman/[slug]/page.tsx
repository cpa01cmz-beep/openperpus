import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { fetchPage, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, page] = await Promise.all([fetchSettings(), fetchPage(slug)]);
  const siteName = settings.name ?? 'Perpustakaan';
  const siteUrl = getSiteUrl();
  if (!page) return { title: `Halaman tidak ditemukan — ${siteName}` };
  const title = `${page.title} — ${siteName}`;
  const description = page.excerpt ?? `Halaman ${page.title} di ${siteName}.`;
  const canonical = `${siteUrl}/halaman/${slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'article',
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

/** Halaman dinamis dari tabel pages (slug apa pun yang is_active). */
export default async function HalamanDetailPage({ params }: Props) {
  const { slug } = await params;
  const page = await fetchPage(slug);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium text-ink/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
      </Link>

      <article className="kartu overflow-hidden">
        <div className="px-5 pb-8 pt-7 sm:px-8 sm:pt-8">
          <div className="kartu-kop pb-4">
            <h1 className="font-heading text-2xl font-bold leading-tight tracking-[-0.02em] text-heading sm:text-4xl">
              {page.title}
            </h1>
          </div>
          {page.excerpt && (
            <p className="mt-4 max-w-[70ch] bg-accent-soft px-4 py-3 text-sm italic leading-relaxed text-ink sm:text-base">
              {page.excerpt}
            </p>
          )}
          {page.content_md ? (
            <div className="mt-5 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
              {page.content_md}
            </div>
          ) : (
            <p className="entri mt-5 max-w-[70ch] text-sm uppercase tracking-[0.08em] text-ink/70">
              Konten halaman ini belum diisi admin.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}
