import { notFound, permanentRedirect } from 'next/navigation';
import { fetchBookBySlug, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 60;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const [book, settings] = await Promise.all([fetchBookBySlug(params.slug), fetchSettings()]);
  if (!book) return { title: 'Buku tidak ditemukan' };
  const siteName = settings.name ?? 'Perpustakaan';
  const title = `${book.title} — ${siteName}`;
  const description = book.description?.slice(0, 160) ?? `Detail buku ${book.title}.`;
  const url = `${getSiteUrl()}/katalog/${params.slug}`;
  const image = book.cover_url ?? '/og-default.jpg';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'book',
      locale: 'id_ID',
      url,
      siteName,
      images: [{ url: image, alt: `Sampul ${book.title}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/**
 * Alias kontrak lama `/buku/[slug]` → kanonis `/katalog/[slug]`.
 * Mempertahankan semantik 404 bila slug tak ada, lalu redirect permanen
 * agar tidak ada duplikasi URL detail buku.
 */
export default async function BukuAliasPage({ params }: Props) {
  const book = await fetchBookBySlug(params.slug);
  if (!book) notFound();
  permanentRedirect(`/katalog/${params.slug}`);
}
