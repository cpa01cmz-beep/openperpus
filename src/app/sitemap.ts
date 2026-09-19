import type { MetadataRoute } from 'next';
import { fetchArticles, fetchBooks, fetchPages } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 3600;

/** Sitemap: halaman statis + slug buku & artikel published. Gagal fetch → fallback []. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    '',
    '/katalog',
    '/berita',
    '/tentang',
    '/layanan',
    '/faq',
    '/kontak',
  ].map((p) => ({
    url: `${base}${p || '/'}`,
    lastModified: now,
    changeFrequency: p === '' ? 'daily' : 'weekly',
    priority: p === '' ? 1 : 0.7,
  }));

  try {
    const [books, articles, pages] = await Promise.all([
      fetchBooks({ limit: 500 }),
      fetchArticles(100),
      fetchPages(100),
    ]);
    const bookUrls: MetadataRoute.Sitemap = (books ?? [])
      .filter((b) => b.slug)
      .map((b) => ({
        url: `${base}/katalog/${b.slug}`,
        lastModified: b.updated_at ? new Date(b.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      }));
    const articleUrls: MetadataRoute.Sitemap = (articles ?? [])
      .filter((a) => a.slug)
      .map((a) => ({
        url: `${base}/berita/${a.slug}`,
        lastModified: a.published_at ? new Date(a.published_at) : now,
        changeFrequency: 'monthly',
        priority: 0.6,
      }));
    const pageUrls: MetadataRoute.Sitemap = (pages ?? [])
      .filter((p) => p.slug)
      .map((p) => ({
        url: `${base}/halaman/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: 'monthly',
        priority: 0.5,
      }));
    return [...statics, ...bookUrls, ...articleUrls, ...pageUrls];
  } catch {
    return statics;
  }
}
